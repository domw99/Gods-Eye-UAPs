#!/usr/bin/env node
/**
 * Build the GEIPAN layer: France's official UAP case files.
 *
 * GEIPAN (CNES, the French space agency) publishes every case it has made
 * public as two CSV files: cases (name, date, department, summary and an
 * A–D classification) and testimonies (observation times and places).
 * This script joins them, geocodes each case to its commune with the
 * GeoNames France dump (offline), converts the observation time to UTC and
 * writes public/data/geipan.json.
 *
 * The case file was exported with its accents replaced by "�". They are
 * restored word by word from the vocabulary of the testimony file, which
 * kept them.
 *
 *   node scripts/build-geipan.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, cached, norm, unzipEntry, loadGazetteer, regionCentroid } from './lib/geonames.mjs';

const OUT = path.join(ROOT, 'public/data/geipan.json');
const BASE = 'https://cnes-geipan.fr/sites/default/files/';
const CASES_URL = `${BASE}Base_de_donn%C3%A9es_des_cas.csv`;
const TESTIMONIES_URL = `${BASE}Base_de_donn%C3%A9es_des_t%C3%A9moignages.csv`;

/* ── Helpers (exported for tests) ──────────────────────────────────── */

/** Minimal CSV reader: `;` separated, double-quoted fields may hold separators and newlines. */
export function parseCsv(text, sep = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const BROKEN = '�';
/** The shape of a word with every non-ASCII letter blanked, as the broken export did. */
export const skeleton = (w) => w.toLowerCase().replace(/[^\x00-\x7f]/g, BROKEN);

/** Word-frequency vocabulary keyed by skeleton, from correctly accented French text. */
export function buildVocabulary(texts) {
  const counts = new Map();
  for (const t of texts)
    for (const w of t.match(/[\p{L}]+(?:['’][\p{L}]+)?/gu) || []) {
      const lw = w.toLowerCase();
      counts.set(lw, (counts.get(lw) || 0) + 1);
    }
  const best = new Map();
  for (const [w, n] of counts) {
    if (!/[^\x00-\x7f]/.test(w)) continue;
    const k = skeleton(w);
    const cur = best.get(k);
    if (!cur || n > cur.n) best.set(k, { w, n });
  }
  return best;
}

const matchCase = (src, w) =>
  src === src.toUpperCase() && src.length > 1 ? w.toUpperCase() : /^\p{Lu}/u.test(src) ? w[0].toUpperCase() + w.slice(1) : w;

/** Put the accents back into text whose non-ASCII letters became "�". */
export function repairAccents(text, vocab) {
  if (!text || !text.includes(BROKEN)) return text;
  return text
    .replace(/[\p{L}�]+/gu, (tok) => {
      if (!tok.includes(BROKEN) || /^�+$/.test(tok)) return tok; // lone marks: see below
      const hit = vocab.get(skeleton(tok));
      if (hit) return matchCase(tok, hit.w);
      // "l�objet", "qu�il": a curly apostrophe after an elided article.
      const elided = tok.match(/^([ldjmnstc]|qu|jusqu|lorsqu|puisqu)�(\p{L}.*)$/iu);
      if (elided) return `${elided[1]}’${repairAccents(elided[2], vocab)}`;
      return tok.replace(/�/g, 'é');
    })
    // A lone mark after digits was a degree sign; one standing alone was "à";
    // anything else was a curly apostrophe or quote.
    .replace(/�/g, (_, i, s) => (/\d/.test(s[i - 1] || '') ? '°' : /\s/.test(s[i - 1] || ' ') && /\s/.test(s[i + 1] || ' ') ? 'à' : '’'));
}

/**
 * "ILLKIRCH-GRAFFENSTADEN (67) 22.11.1996" → { place, dept, cc, y, m, d }.
 * Older files give only a year ("SAUMUR (49) 1978") or a decade ("199-"),
 * and cases abroad carry a country code ("TANGER (MA.01) 05.09.1954").
 */
export function parseCaseName(name) {
  const m = name.trim().match(/^(.*?)\s*\(([\w.]{1,6})\)\s*(?:([\d-]{2})\.([\d-]{2})\.)?(\d{3}[\d-])$/);
  if (!m) return null;
  let place = m[1].trim().replace(/^\[[^\]]*\]\s*/, ''); // "[MER] …", "[AERO EZY] …"
  // "MARIGOT (LE)" → "LE MARIGOT"; "ISLE (L')" → "L'ISLE"
  place = place.replace(/^(.*?)\s*\((LE|LA|LES|L')\)$/i, (_, p, art) => (art.endsWith("'") ? `${art}${p}` : `${art} ${p}`));
  const abroad = m[2].match(/^([A-Z]{2})\.\w+$/);
  const num = (s) => (s && /^\d+$/.test(s) ? +s : null);
  return { place, dept: abroad ? null : m[2], cc: abroad ? abroad[1] : null, y: num(m[5]), m: num(m[4]), d: num(m[3]) };
}

/** Time zones for France and the overseas departments GEIPAN covers. */
const DEPT_TZ = {
  971: 'America/Guadeloupe',
  972: 'America/Martinique',
  973: 'America/Cayenne',
  974: 'Indian/Reunion',
  975: 'America/Miquelon',
  976: 'Indian/Mayotte',
  986: 'Pacific/Wallis',
  987: 'Pacific/Tahiti',
  988: 'Pacific/Noumea',
};
const DEPT_CC = { 971: 'GP', 972: 'MQ', 973: 'GF', 974: 'RE', 975: 'PM', 976: 'YT', 986: 'WF', 987: 'PF', 988: 'NC' };
/** The few cases abroad: former French territories in the 1950s and some recent ones. */
const CC_TZ = {
  DZ: 'Africa/Algiers', MA: 'Africa/Casablanca', GA: 'Africa/Libreville', ML: 'Africa/Bamako', SN: 'Africa/Dakar',
  EC: 'America/Guayaquil', ES: 'Europe/Madrid', CH: 'Europe/Zurich', MC: 'Europe/Monaco', GB: 'Europe/London',
};
export const timeZoneFor = (dept, cc = null) => (cc && CC_TZ[cc]) || DEPT_TZ[dept] || 'Europe/Paris';

function offsetMs(ts, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
}

/** Local wall-clock time in `tz` → UTC ISO string. */
export function localToUtc(y, mo, d, hh, mm, tz) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  let utc = guess - offsetMs(guess, tz);
  const again = guess - offsetMs(utc, tz); // across a DST change, use the offset at the result
  if (again !== utc) utc = again;
  return new Date(utc).toISOString().slice(0, 16) + 'Z';
}

/* ── Build ─────────────────────────────────────────────────────────── */

async function loadFrancePlaces() {
  const txt = unzipEntry(await cached('FR.zip', 'https://download.geonames.org/export/dump/FR.zip'), 'FR.txt').toString('utf8');
  const byDept = new Map(); // "67|illkirchgraffenstaden" -> { name, lat, lon, pop, rank }
  const deptPts = new Map(); // "67" -> [{lat, lon, pop}]
  for (const line of txt.split('\n')) {
    const f = line.split('\t');
    if (f.length < 15) continue;
    const cls = f[6];
    const code = f[7];
    if (!(cls === 'P' || (cls === 'A' && code === 'ADM4'))) continue;
    const rec = { name: f[1], lat: +f[4], lon: +f[5], pop: +f[14] || 0, rank: code === 'ADM4' ? 2 : code.startsWith('PPL') ? 1 : 0 };
    const dept = f[11];
    if (!dept) continue;
    for (const n of new Set([f[1], f[2]])) {
      const k = `${dept}|${norm(n)}`;
      const cur = byDept.get(k);
      if (!cur || rec.rank > cur.rank || (rec.rank === cur.rank && rec.pop > cur.pop)) byDept.set(k, rec);
    }
    if (!deptPts.has(dept)) deptPts.set(dept, []);
    deptPts.get(dept).push(rec);
  }
  const centroid = new Map();
  for (const [dept, pts] of deptPts) {
    let w = 0, lat = 0, lon = 0;
    for (const p of pts) {
      const k = Math.sqrt(p.pop + 1);
      w += k; lat += p.lat * k; lon += p.lon * k;
    }
    centroid.set(dept, { lat: lat / w, lon: lon / w });
  }
  return { byDept, centroid };
}

function geocode(fr, gz, parsed, obsCommunes) {
  const ll = parsed.place.match(/LAT\s*(-?[\d.]+),\s*LON\s*(-?[\d.]+)/i); // at sea
  if (ll) return { lat: +ll[1], lon: +ll[2], prec: 2, place: 'At sea' };
  const dept = parsed.dept;
  const cc = parsed.cc || DEPT_CC[dept];
  const parts = [parsed.place, ...parsed.place.split(/\s*(?:\/|,|\bET\b| - |\bVERS\b|^DE\b)\s*/i), ...obsCommunes];
  for (const part of parts) {
    const k = norm(part);
    if (k.length < 2) continue;
    if (cc) {
      const hit = (gz.byName.get(k) || []).filter((r) => r.cc === cc).sort((a, b) => b.pop - a.pop)[0];
      if (hit) return { lat: hit.lat, lon: hit.lon, prec: 2, place: hit.name };
    } else {
      const hit = fr.byDept.get(`${dept}|${k}`);
      if (hit) return { lat: hit.lat, lon: hit.lon, prec: 2, place: hit.name };
    }
  }
  const c = cc ? regionCentroid(gz, cc) : fr.centroid.get(dept);
  return c ? { lat: c.lat, lon: c.lon, prec: 1, place: null } : null;
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'’(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

async function main() {
  const casesText = (await cached('geipan/cases.csv', CASES_URL)).toString('utf8');
  const testimoniesText = (await cached('geipan/testimonies.csv', TESTIMONIES_URL)).toString('latin1');
  const cases = parseCsv(casesText);
  const testimonies = parseCsv(testimoniesText);
  console.log(`GEIPAN: ${cases.length} cases, ${testimonies.length} testimonies`);

  const vocab = buildVocabulary(
    testimonies.flatMap((t) => [t.tem_resume, t.obs_description, t.tem_title_nickname, t.obs_1_adr_commune]).filter(Boolean),
  );
  const fr = await loadFrancePlaces();
  const gz = await loadGazetteer();

  // Earliest recorded observation time and the observation communes, per case.
  const byCase = new Map();
  for (const t of testimonies) {
    const e = byCase.get(t.id_cas) || { time: null, communes: new Set() };
    const m = t.obs_date_heure?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (m && !(m[4] === '00' && m[5] === '00' && !t.obs_heure_plage)) {
      const key = `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}`;
      if (!e.time || key < e.time.key) e.time = { key, parts: m.slice(1, 6).map(Number) };
    }
    if (t.obs_1_adr_commune) e.communes.add(t.obs_1_adr_commune);
    byCase.set(t.id_cas, e);
  }

  // The zone name is sometimes wrong for the department code, so name each
  // department by the zone most cases with that code carry.
  const votes = new Map();
  for (const c of cases) {
    const code = c.cas_zone_code;
    if (!code || !c.cas_zone_type.startsWith('(D)')) continue;
    const v = votes.get(code) || new Map();
    const zone = repairAccents(c.cas_zone_nom, vocab);
    v.set(zone, (v.get(zone) || 0) + 1);
    votes.set(code, v);
  }
  const deptName = new Map([...votes].map(([code, v]) => [code, [...v].sort((a, b) => b[1] - a[1])[0][0]]));
  const countryName = new Map([...gz.countries.values()].map((c) => [c.cc, c.name]));

  const records = [];
  const stats = { commune: 0, department: 0, none: 0, timed: 0 };
  for (const c of cases) {
    const parsed = parseCaseName(repairAccents(c.cas_nom_dossier, vocab));
    const extra = byCase.get(c.id_cas) || { time: null, communes: new Set() };
    const g = parsed ? geocode(fr, gz, parsed, [...extra.communes]) : null;
    stats[g ? (g.prec === 2 ? 'commune' : 'department') : 'none']++;
    // A decade ("199-") has an arbitrary year in the study number; GEIPAN says so in the summary.
    const y = +c.cas_AAAA || parsed?.y || +c.cas_numEtude.trim().slice(0, 4) || null;
    const mo = /^\d+$/.test(c.cas_MM) ? +c.cas_MM : null;
    const d = /^\d+$/.test(c.cas_JJ) ? +c.cas_JJ : null;
    // Keep an observation time only when the case has a full date and the
    // testimony falls on it; undated cases carry placeholder times.
    let utc = null;
    let local = null;
    if (extra.time && parsed && y && mo && d) {
      const [ty, tmo, td, hh, mm] = extra.time.parts;
      const t = localToUtc(ty, tmo, td, hh, mm, timeZoneFor(parsed.dept, parsed.cc));
      if (Math.abs(Date.parse(t) - Date.UTC(y, mo - 1, d)) < 1.5 * 86400e3) {
        utc = t;
        local = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        stats.timed++;
      }
    }
    const zone = parsed?.cc ? countryName.get(parsed.cc) || parsed.cc : deptName.get(parsed?.dept) || repairAccents(c.cas_zone_nom, vocab);
    const placeName = g?.place || (parsed ? titleCase(parsed.place) : titleCase(zone || ''));
    records.push([
      c.cas_numEtude.trim(),
      g ? +g.lat.toFixed(4) : null,
      g ? +g.lon.toFixed(4) : null,
      g ? g.prec : 0,
      placeName,
      zone,
      parsed?.cc || (parsed?.dept && /^\w{1,3}$/.test(parsed.dept) ? parsed.dept : c.cas_zone_code),
      y,
      mo,
      d,
      utc,
      local,
      c.cas_classification || '',
      +c.cas_temoins_nb || null,
      repairAccents(c.cas_resume_web, vocab).replace(/<br\s*\/?>/gi, ' ').trim(),
      repairAccents(c.cas_resume, vocab).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim().slice(0, 1200),
    ]);
  }
  records.sort((a, b) => (a[7] || 0) - (b[7] || 0) || (a[8] || 0) - (b[8] || 0) || (a[9] || 0) - (b[9] || 0));
  const payload = {
    generated: new Date().toISOString(),
    source:
      'GEIPAN (Groupe d’études et d’informations sur les phénomènes aérospatiaux non identifiés), CNES — published case database (cnes-geipan.fr). Communes geocoded with GeoNames (CC BY 4.0).',
    caseUrl: 'https://www.cnes-geipan.fr/fr/cas/',
    fields: ['id', 'lat', 'lon', 'precision(2=commune,1=department,0=none)', 'place', 'zone', 'dept', 'year', 'month', 'day', 'utc', 'localTime', 'class', 'witnesses', 'short', 'summary'],
    stats,
    count: records.length,
    records,
  };
  await writeFile(OUT, JSON.stringify(payload) + '\n');
  const left = records.reduce((n, r) => n + (r[14].includes(BROKEN) || r[15].includes(BROKEN) ? 1 : 0), 0);
  console.log(stats, `records with unrepaired characters: ${left}`, `${(JSON.stringify(payload).length / 1e6).toFixed(2)} MB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
