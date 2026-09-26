#!/usr/bin/env node
/**
 * Build the MUFON files layer.
 *
 * The Mutual UFO Network's monthly journal (Skylook from 1967, the MUFON UFO
 * Journal from 1976) was released free by MUFON and The Black Vault as "The
 * MUFON Archive" and is mirrored with OCR on the Internet Archive item
 * `MUFON_UFO_Journal_-_Skylook` (CC BY-NC-ND 4.0).
 *
 * This script reads each issue's OCR text page by page (cached in
 * .cache/mufon/, never committed) and writes public/data/mufon.json with:
 *   - the list of issues;
 *   - "Town, State" / "Town, Country" places named in sighting reports,
 *     geocoded offline with GeoNames, each with its page and a short quote;
 *   - the pages that discuss each curated case;
 *   - MUFON chapter newsletters in the Archives for the Unexplained
 *     collection on the Internet Archive.
 * Only places, page numbers and short quotes are stored, not the text.
 *
 *   node scripts/build-mufon.mjs
 */
import { writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, UA, cached, norm, loadGazetteer, resolveRegionToken, inRegion } from './lib/geonames.mjs';

export const ITEM = 'MUFON_UFO_Journal_-_Skylook';
const OUT = path.join(ROOT, 'public/data/mufon.json');
const DL = `https://archive.org/download/${ITEM}`;

/* ── Text helpers (exported for tests) ─────────────────────────────── */

/** "1978_01" → { year: 1978, month: 1 }; "1968_02-03" → month 2. */
export function parseIssueName(name) {
  const m = name.match(/^(\d{4})[_-](\d{2})(?:-(\d{2}))?$/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], monthTo: m[3] ? +m[3] : null };
}

// Sighting vocabulary that should appear near a place for it to count.
const SIGHTING =
  /\b(UFOs?|sight(?:ing|ings|ed)|saw|seen|observ\w*|witness\w*|objects?|craft|discs?|disks?|saucers?|hover\w*|land(?:ed|ing)|encounter\w*|CE-?I{1,3}|abduct\w*|luminous|glow\w*|beams?|humanoids?|entit(?:y|ies)|radar|lights?)\b/i;
// Addresses, mastheads, meetings and press citations name places that are not sightings.
const NOT_SIGHTING =
  /\b(Rd|Road|Street|Ave|Avenue|Blvd|Box|Suite|Zip|subscri\w*|postage|published|publisher|Edition|Books|Publishing|Director|Directors|Representatives?|Consultants?|Coordinator|Symposium|Conference|Congress|Convention|Expo|seminar|workshop|meetings?|lectur\w*|speakers?|spoke|Hotel|Motel|Inn|chapter|elected|appointed|members?|membership|newsletter|reprinted|courtesy|write|phone|telephone|registration|tickets|headquarter\w*|offices?|Gazette|Times|Tribune|Herald|Enquirer|Examiner|Chronicle|Courier|Sentinel|Press|Dispatch|Bulletin|Daily|Weekly|Magazine|University|College|Institute|Laboratory|Foundation|Corporation|Inc|CUFOS|NICAP|APRO|Center for UFO Studies|Space Center|Mission Control)\b|\b\d{5}\b/i;
// Words that may come right before a place in a report ("seen near Delphos", "over Houston").
const LEAD_WORDS = new Set(
  'in near over at of around above outside to between and off by into toward towards across through along on via the a an nr north south east west northeast northwest southeast southwest northern southern eastern western'.split(' '),
);
// Amateur-radio call signs: MUFON ran ham nets, and check-ins name members' towns.
const CALL_SIGN = /\b[KNW][A-Z]?\d[A-Z]{2,3}\b/;
// Where UFO groups had their offices; mentions about the group itself are not sightings.
const ORG_TOWNS = {
  'Seguin, Texas': /MUFON|Andrus|ballots?|mail|purchase|order|Journal|office|Oldtowne/i,
  'Quincy, Illinois': /MUFON|APRO|Andrus|Skylook|Tri-State|Midwest UFO Network|Study Group|meet/i,
  'Evanston, Illinois': /CUFOS|Center for UFO Studies|Hynek/i,
  'Chicago, Illinois': /CUFOS|Center for UFO Studies|Hynek/i,
  'Seattle, Washington': /NUFORC|Reporting Center|Gribble|Davenport|Clipping|Contact Center|Research bureau|Information Service/i,
  'Tucson, Arizona': /APRO|Lorenzen|Aerial Phenomena Research/i,
  'Austin, Texas': /Starlight|Stanford|MUFON|Symposium/i,
  'Washington, Washington, D.C.': /NICAP|Air Force|Department|Congress|Pentagon|CIA|FBI|law firm|Fund for UFO Research|Right to Know|area|lunch|mall/i,
  'Mount Rainier, Maryland': /Fund for UFO Research/i,
  'Morrison, Colorado': /MUFON/i,
};
// Hometowns and moves, not sightings: "Walt Andrus of Seguin", "moving to Seguin".
const HOMETOWN =
  /(?:[A-Z][A-Za-z.'’]*,?\s+of|\b(?:moved|moving|transferred|lives|living|resides|resided|residing|born|native|home|headquartered|based|residents?)\s+(?:in|to|of|at))\s+$/;

const WORD = String.raw`(?:[A-Z][A-Za-z'’.-]*[A-Za-z.]|St\.|Ft\.|Mt\.)`;
const PLACE_RE = new RegExp(
  String.raw`(${WORD}(?:\s+(?:${WORD}|de|del|la|el|du|des|le|los|las)){0,3}),\s+([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)?)(?=[\s,.;:)'"”’-]|$)`,
  'g',
);

/**
 * Find "Town, Region" mentions in a page of text. `lookup(cityWords, region)`
 * returns a gazetteer hit or null. Returns [{ index, length, place, lat, lon }].
 */
export function findPlaces(text, resolveRegion, lookup) {
  const out = [];
  PLACE_RE.lastIndex = 0;
  let m;
  while ((m = PLACE_RE.exec(text))) {
    const regionWords = m[2].split(/\s+/);
    let region = null;
    let regionLen = 0;
    for (let k = regionWords.length; k >= 1 && !region; k--) {
      region = resolveRegion(regionWords.slice(0, k).join(' '));
      if (region) regionLen = regionWords.slice(0, k).join(' ').length;
    }
    if (!region) continue;
    const words = m[1].split(/\s+/);
    let hit = null;
    let cityStart = 0;
    // Longest trailing phrase first, so "Fort Worth" wins over "Worth".
    for (let i = 0; i < words.length && !hit; i++) {
      const cand = words.slice(i).join(' ');
      if (norm(cand).length < 3) continue;
      hit = lookup(cand, region);
      if (hit) cityStart = m[1].length - cand.length;
    }
    if (!hit) continue;
    const index = m.index + cityStart;
    const length = m[1].length - cityStart + 2 + regionLen;
    out.push({ index, length, place: `${hit.name}, ${region.label}`, lat: hit.lat, lon: hit.lon });
  }
  return out;
}

/** Is the place at [index, index+length) in a sighting report rather than an address or citation? */
export function sightingContext(text, index, length, place = '') {
  const before = text.slice(Math.max(0, index - 60), index);
  if (HOMETOWN.test(before)) return false;
  if (/^\W{0,3}(?:residents?|natives?)\b/i.test(text.slice(index + length, index + length + 16))) return false;
  if (ORG_TOWNS[place]?.test(text.slice(Math.max(0, index - 160), index + length + 160))) return false;
  // The word before the place: a preposition, a sentence or dateline start, or a headline.
  const prev = before.match(/(\S+)\s*$/)?.[1] || '';
  const leadOk =
    !prev ||
    /[.!?"”)\]—–:-]$/.test(prev) ||
    (/^[A-Z]{3,}$/.test(prev) && !/^[A-Z]{2}\.?$/.test(prev)) ||
    LEAD_WORDS.has(prev.toLowerCase());
  if (!leadOk) return false;
  const near = text.slice(Math.max(0, index - 90), index + length + 60);
  if (NOT_SIGHTING.test(near) || CALL_SIGN.test(near)) return false;
  const wide = text.slice(Math.max(0, index - 320), index + length + 320);
  return SIGHTING.test(wide);
}

/** A short quote around [index, index+length), cut at word boundaries. */
export function quote(text, index, length, pad = 110) {
  let a = Math.max(0, index - pad);
  let b = Math.min(text.length, index + length + pad);
  if (a > 0) a = text.indexOf(' ', a) + 1 || a;
  if (b < text.length) b = text.lastIndexOf(' ', b) > index + length ? text.lastIndexOf(' ', b) : b;
  return `${a > 0 ? '…' : ''}${text.slice(a, b).trim()}${b < text.length ? '…' : ''}`;
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

/* ── Curated-case matching ─────────────────────────────────────────── */

const STOP = new Set(
  `the and over near from with lights light incident sighting sightings encounter encounters case files file
  object objects wave flap disc disk sphere spheres saucer craft triangle report reports photo photos film video
  air force base naval station airport international county lake river valley mount mountain island bay coast
  north south east west northern southern eastern western central new old great upper lower united states kingdom
  police army navy military pilots pilot crew airline flight jet bomber interceptor ship uss hms ufo ufos uap
  near outside above along between city town village desert ocean sea gulf atlantic pacific channel
  january february march april may june july august september october november december
  hotel school farm ranch highway route road bridge harbour harbor tower hill hills landing crash
  radar visual daylight night fireball fireballs formation mass shoot downs balloon balloons drones drone
  holy roman empire swiss confederacy republic province state region territory kingdom ministry
  battle squadron islands christmas mexican brazilian fighters flying cross night stadium school wave
  dakota carolina scotia zealand jersey hampshire york virginia`.split(/\s+/),
);

const words = (text) =>
  text
    .replace(/[“”"()]/g, ' ')
    .split(/[\s,/—–-]+/)
    .map((w) => w.replace(/['’]s$/, '').replace(/[^A-Za-z'’]/g, ''))
    .filter((w) => /^[A-Z][a-z]/.test(w) && w.length >= 4 && !STOP.has(w.toLowerCase()));

/**
 * Candidate search words for a case: words from its title, plus words from
 * its place that are town names (`isTown`), so regions like "Gauteng" or
 * "Erath" County don't match unrelated news from the same area.
 */
export function caseTerms(c, isTown = () => true) {
  const title = words(c.title);
  const place = words(c.place).filter((w) => !title.includes(w) && isTown(w));
  return [...new Set([...title, ...place])];
}

/** Two-word names from a case title ("Kenneth Arnold", "Travis Walton"). */
export function casePairs(c) {
  const t = c.title.replace(/[“”"()]/g, ' ').split(/[\s,/—–]+/).map((w) => w.replace(/['’]s$/, ''));
  const out = [];
  for (let i = 0; i + 1 < t.length; i++)
    if (/^[A-Z][a-z]{2,}$/.test(t[i]) && /^[A-Z][a-z]{2,}$/.test(t[i + 1]) && !STOP.has(t[i].toLowerCase()) && !STOP.has(t[i + 1].toLowerCase()))
      out.push(`${t[i]} ${t[i + 1]}`);
  return out;
}

/* ── Internet Archive ──────────────────────────────────────────────── */

async function json(name, url) {
  return JSON.parse((await cached(name, url)).toString('utf8'));
}

async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i], i);
      }
    }),
  );
  return out;
}

async function loadIssues() {
  const meta = await json('mufon/metadata.json', `https://archive.org/metadata/${ITEM}`);
  const names = new Set(meta.files.map((f) => f.name));
  const subs = [
    ...new Set(meta.files.filter((f) => /\.pdf$/i.test(f.name)).map((f) => f.name.replace(/\.pdf$/i, ''))),
  ]
    .filter((s) => names.has(`${s}_hocr_searchtext.txt.gz`) && names.has(`${s}_hocr_pageindex.json.gz`))
    .map((s) => ({ id: s, ...parseIssueName(s) }))
    .filter((s) => s.year)
    .sort((a, b) => a.year - b.year || a.month - b.month);

  const loaded = await mapLimit(subs, 4, async (s) => {
    try {
      return await readIssue(s);
    } catch (e) {
      console.warn(`Skipping ${s.id}: ${e.message}`);
      return null;
    }
  });
  return loaded.filter(Boolean);
}

async function readIssue(s) {
  const text = gunzipSync(await cached(`mufon/${s.id}_hocr_searchtext.txt.gz`, `${DL}/${s.id}_hocr_searchtext.txt.gz`)).toString('utf8');
  const index = JSON.parse(gunzipSync(await cached(`mufon/${s.id}_hocr_pageindex.json.gz`, `${DL}/${s.id}_hocr_pageindex.json.gz`)));
  // Offsets count Unicode code points; slice an array of code points to stay aligned.
  const cps = Array.from(text);
  const pages = index.map(([a, b]) => clean(cps.slice(a, b).join('')));
  const head = pages.slice(0, 4).join(' ');
  const cover = /BLACK VAULT/i.test(pages[0] || '');
  const num = head.match(/\b(?:NUMBER|Number|No\.?)\s*(\d{1,3})\b/);
  const title = /SKYLOOK/i.test(head) && !/MUFON UFO JOURNAL/i.test(head) ? 'Skylook' : 'MUFON UFO Journal';
  return { ...s, pages, cover, number: num ? +num[1] : null, title };
}

async function loadChapters() {
  const q = new URLSearchParams({ q: 'collection:ufonewsletters AND title:(MUFON)', rows: '2000', output: 'json' });
  for (const f of ['identifier', 'title', 'date']) q.append('fl[]', f);
  const res = await fetch(`https://archive.org/advancedsearch.php?${q}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`archive.org ${res.status}`);
  const docs = (await res.json()).response.docs;
  const groups = new Map();
  for (const d of docs) {
    const title = clean(d.title || d.identifier);
    const name = clean(
      title
        .replace(/\b(No|Nr|Number|Vol|Volume|Issue)\b\.?\s*\d.*$/i, '')
        .replace(/\b(1[89]|20)\d{2}\b.*$/, '')
        .replace(/[:\-–—,]+$/, ''),
    ) || title;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push([d.identifier, title, d.date ? d.date.slice(0, 10) : null]);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, items: items.sort((a, b) => (a[2] || a[1]).localeCompare(b[2] || b[1])) }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

/* ── Places and case pages (shared with build-journals.mjs) ────────── */

/** Region and town lookups over the GeoNames gazetteer. */
export function makeResolvers(gz) {
  const regionCache = new Map();
  const resolveRegion = (t) => {
    if (!regionCache.has(t)) {
      // Two-letter codes only when written in capitals ("TX"), never words like "In" or "Me".
      const ok = t.length > 2 || /^[A-Z]{2}$/.test(t) || /\./.test(t);
      regionCache.set(t, ok ? resolveRegionToken(gz, t) : null);
    }
    return regionCache.get(t);
  };
  const lookup = (cand, region) => {
    if (region.lat != null) return null; // oceans and seas have no towns
    const hits = (gz.byName.get(norm(cand)) || []).filter((r) => inRegion(region, r));
    return hits.sort((a, b) => b.pop - a.pop)[0] || null;
  };
  return { resolveRegion, lookup };
}

/**
 * Places named in sighting reports, one per place per issue. `issues` carry
 * { year, pages[], cover }; `groupOf(issue)` names the publication whose
 * mastheads are filtered out (a place in most of its issues in a year).
 */
export function extractPlaces(issues, { resolveRegion, lookup }, groupOf = () => '') {
  const raw = []; // { issue, leaf, place, lat, lon, quote }
  for (const [ii, is] of issues.entries()) {
    const seen = new Set();
    is.pages.forEach((page, leaf) => {
      if (leaf === 0 && is.cover) return;
      for (const f of findPlaces(page, resolveRegion, lookup)) {
        if (seen.has(f.place) || !sightingContext(page, f.index, f.length, f.place)) continue;
        seen.add(f.place);
        raw.push({ issue: ii, leaf, place: f.place, lat: f.lat, lon: f.lon, quote: quote(page, f.index, f.length) });
      }
    });
  }
  // A place named in most issues of a year is a masthead or office address.
  const perYear = new Map();
  const key = (is, place) => `${groupOf(is)}|${is.year}|${place}`;
  for (const r of raw) {
    const k = key(issues[r.issue], r.place);
    perYear.set(k, (perYear.get(k) || 0) + 1);
  }
  const issuesInYear = new Map();
  for (const is of issues) {
    const k = `${groupOf(is)}|${is.year}`;
    issuesInYear.set(k, (issuesInYear.get(k) || 0) + 1);
  }
  const kept = raw.filter((r) => {
    const is = issues[r.issue];
    const n = issuesInYear.get(`${groupOf(is)}|${is.year}`);
    return n < 2 || perYear.get(key(is, r.place)) / n < 0.5;
  });
  const placeNames = [...new Set(kept.map((r) => r.place))].sort();
  const placeIdx = new Map(placeNames.map((p, i) => [p, i]));
  const places = kept.map((r) => [+r.lat.toFixed(4), +r.lon.toFixed(4), r.issue, r.leaf, placeIdx.get(r.place), r.quote]);
  return { raw: raw.length, placeNames, places };
}

/** The pages that discuss each curated case: { caseId: { term, total, hits: [[issue, leaf, quote]] } }. */
export function matchCases(issues, CASES, gz) {
  const lowerIssues = issues.map((is) => is.pages.join(' ').toLowerCase());
  const df = (term) => lowerIssues.reduce((n, t) => n + (t.includes(term.toLowerCase()) ? 1 : 0), 0);
  // Place words must be towns, not states, provinces or countries ("Montana", "Belgium").
  const isTown = (w) => gz.byName.has(norm(w)) && !resolveRegionToken(gz, w);
  const wordRe = (t) => new RegExp(`\\b(?:${t}|${t.toUpperCase()})\\b`);
  const cases = {};
  for (const c of CASES) {
    const d = new Date(c.date);
    const year = d.getUTCFullYear();
    const ym = year * 12 + d.getUTCMonth();
    const terms = caseTerms(c, isTown)
      .filter((t) => !resolveRegionToken(gz, t))
      .map((t) => ({ t, n: df(t), re: wordRe(t) }))
      .filter((x) => x.n >= 1 && x.n <= 150);
    const pairs = casePairs(c)
      .map((t) => ({ t, n: df(t), re: new RegExp(t.split(' ').join('\\W{1,3}'), 'i'), pair: true }))
      .filter((x) => x.n >= 1);
    if (!terms.length) continue;
    // Pages that name the term and are about the right time: the case year on
    // the page, or an issue from the two years after it. A term that is not
    // very distinctive also needs the year or a second word from the case.
    const pagesFor = (x) => {
      const out = [];
      issues.forEach((is, ii) => {
        const gap = is.year * 12 + (is.month || 1) - 1 - ym;
        is.pages.forEach((page, leaf) => {
          if (leaf === 0 && is.cover) return;
          const m = page.match(x.re);
          if (!m) return;
          if (gap < 0) return; // before the event
          // Every page carries its issue date in the header, so the case year
          // only counts when it is not the issue's own year.
          const hasYear = is.year !== year && page.includes(String(year));
          if (!(hasYear || gap <= 24)) return;
          const second = terms.some((y) => y !== x && y.re.test(page));
          if (!x.pair && x.n > 20 && !hasYear && !second) return;
          out.push([ii, leaf, quote(page, m.index, x.t.length, 120), second]);
        });
      });
      return out;
    };
    let best = null;
    // A two-word name is the most specific; use it when it finds enough pages.
    for (const x of pairs) {
      const hits = pagesFor(x);
      if (hits.length >= 3 && (!best || hits.length > best.hits.length)) best = { term: x.t, hits };
    }
    if (!best)
      for (const x of terms) {
        const hits = pagesFor(x);
        if (!best || hits.length > best.hits.length) best = { term: x.t, hits };
      }
    if (!best) continue;
    // A single page with nothing else from the case on it is too weak to show.
    if (best.hits.length === 1 && !best.hits[0][3]) continue;
    if (best.hits.length)
      cases[c.id] = { term: best.term, total: best.hits.length, hits: best.hits.slice(0, 12).map(([ii, leaf, q]) => [ii, leaf, q]) };
  }
  return cases;
}

/* ── Build ─────────────────────────────────────────────────────────── */

async function main() {
  const gz = await loadGazetteer();
  const issues = await loadIssues();
  console.log(`Issues with OCR: ${issues.length}`);

  // 1. Places named in sighting reports.
  const { raw, placeNames, places } = extractPlaces(issues, makeResolvers(gz));
  console.log(`Place mentions: ${raw} found, ${places.length} kept, ${placeNames.length} distinct places`);

  // 2. Pages that discuss each curated case.
  const { CASES } = await import('../src/data/cases/index.js');
  const cases = matchCases(issues, CASES, gz);
  console.log(`Curated cases with journal coverage: ${Object.keys(cases).length}/${CASES.length}`);

  // 3. Chapter newsletters (links only).
  let chapters = [];
  try {
    chapters = await loadChapters();
  } catch (e) {
    console.warn('Chapter newsletters unavailable:', e.message);
  }

  const payload = {
    generated: new Date().toISOString(),
    source:
      'MUFON UFO Journal / Skylook (Mutual UFO Network), released as "The MUFON Archive" by MUFON and The Black Vault and mirrored with OCR on the Internet Archive item MUFON_UFO_Journal_-_Skylook (CC BY-NC-ND 4.0). Places found automatically in the OCR text and geocoded with GeoNames (CC BY 4.0).',
    item: ITEM,
    license: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    issueFields: ['id', 'year', 'month', 'monthTo', 'number', 'title', 'pages', 'cover'],
    issues: issues.map((is) => [is.id, is.year, is.month, is.monthTo, is.number, is.title, is.pages.length, is.cover ? 1 : 0]),
    placeFields: ['lat', 'lon', 'issue', 'leaf', 'place', 'quote'],
    placeNames,
    places,
    cases,
    chapters,
  };
  await writeFile(OUT, JSON.stringify(payload) + '\n');
  console.log(`Wrote ${OUT} (${(JSON.stringify(payload).length / 1e6).toFixed(2)} MB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
