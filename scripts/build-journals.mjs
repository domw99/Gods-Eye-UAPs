#!/usr/bin/env node
/**
 * Build the research archives layer: the journals of the other big civilian
 * UFO groups, read from their scans on the Internet Archive.
 *
 *   - APRO Bulletin (Aerial Phenomena Research Organization, 1952–1988),
 *     scanned by the Archives for the Unexplained (AFU);
 *   - The U.F.O. Investigator (NICAP, 1957–1961 as digitised);
 *   - International UFO Reporter (CUFOS, the J. Allen Hynek Center for UFO
 *     Studies, 1976–2011);
 *   - MUFON's state chapter newsletters (AFU).
 *
 * Like build-mufon.mjs it reads the OCR text page by page (cached in
 * .cache/journals/ as extracted pages, never committed), finds places named
 * in sighting reports and the pages about each curated case, and writes
 * public/data/journals.json. Only places, page numbers and short quotes are
 * stored, with links back to the scans.
 *
 *   node scripts/build-journals.mjs
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, CACHE, UA, cached, loadGazetteer } from './lib/geonames.mjs';
import { makeResolvers, extractPlaces, matchCases } from './build-mufon.mjs';

const OUT = path.join(ROOT, 'public/data/journals.json');
const IUR_ITEM = 'iur-vol.-31-no.-4';

export const SERIES = {
  apro: { name: 'APRO Bulletin', org: 'Aerial Phenomena Research Organization (APRO)' },
  nicap: { name: 'The U.F.O. Investigator', org: 'National Investigations Committee on Aerial Phenomena (NICAP)' },
  iur: { name: 'International UFO Reporter', org: 'J. Allen Hynek Center for UFO Studies (CUFOS)' },
  chapters: { name: 'MUFON chapter newsletters', org: 'State chapters of the Mutual UFO Network' },
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SEASONS = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };
const monthOf = (w) => {
  const i = MONTHS.findIndex((m) => m.startsWith(String(w).toLowerCase().slice(0, 3)));
  return i < 0 ? null : i + 1;
};
const clean = (s) => s.replace(/\s+/g, ' ').trim();

/* ── Issue names (exported for tests) ──────────────────────────────── */

/** "AFU_19770800_APRO_Bulletin_v26_n2" or "…_July-August" → { year, month, monthTo, number }. */
export function parseAproId(id) {
  const m = id.match(/^AFU_(\d{4})(\d{2})(\d{2})_/);
  if (!m) return null;
  const month = +m[2] || null;
  const span = id.match(/_([A-Za-z]+)-([A-Za-z]+)(?:_|$)/);
  const monthTo = span && monthOf(span[2]) && monthOf(span[1]) === month ? monthOf(span[2]) : null;
  const vn = id.match(/_v(\d+)_n(\d+)/);
  return { year: +m[1], month, monthTo, number: vn ? `Vol. ${vn[1]} No. ${vn[2]}` : null };
}

/** "Volume 13, number 1 _January_February 1988", "IUR Vol. 27 No. 4 Winter 2002-2003", "IUR Vol. 29 No. 4". */
export function parseIurName(name) {
  let m = name.match(/^Volume (\d+), number (\d+) _([A-Za-z]+)(?:_([A-Za-z]+))? (\d{4})$/);
  if (m) return { year: +m[5], month: monthOf(m[3]), monthTo: m[4] ? monthOf(m[4]) : null, number: `Vol. ${m[1]} No. ${m[2]}` };
  m = name.match(/^IUR Vol\. (\d+) No\. (\d)(?: (Spring|Summer|Fall|Winter) (\d{4}))?/);
  if (!m) return null;
  // A quarterly from Vol. 27 (2002): No. 1 is spring, No. 4 winter; Vol. N ran in 1975 + N.
  const season = m[3] ? SEASONS[m[3].toLowerCase()] : [3, 6, 9, 12][+m[2] - 1];
  return { year: m[4] ? +m[4] : 1975 + +m[1], month: season, monthTo: null, number: `Vol. ${m[1]} No. ${m[2]}` };
}

/** "sim_u-f-o-investigator_february-march-1959_4_10" with the item date "1959-02". */
export function parseNicap(id, date, title = '') {
  const d = String(date || '').match(/^(\d{4})-(\d{2})/);
  if (!d) return null;
  const span = id.match(/_([a-z]+)-([a-z]+)-\d{4}_/);
  const vi = title.match(/Vol (\d+) Iss (\d+)/);
  return { year: +d[1], month: +d[2], monthTo: span ? monthOf(span[2]) : null, number: vi ? `Vol. ${vi[1]} No. ${vi[2]}` : null };
}

/**
 * The year and month of an undated newsletter: the year its first pages name
 * most often, ignoring years before the publisher existed (articles often
 * cite 1947 or 1952).
 */
export function dateFromText(pages, maxYear = new Date().getUTCFullYear(), minYear = 1940) {
  const head = pages.slice(0, 2).join(' ');
  const counts = new Map();
  for (const m of head.matchAll(/\b(19[4-9]\d|20[0-2]\d)\b/g)) {
    const y = +m[1];
    if (y <= maxYear && y >= minYear) counts.set(y, (counts.get(y) || 0) + 1);
  }
  if (!counts.size) return null;
  const year = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const mm = head.match(new RegExp(`\\b(${MONTHS.join('|')})\\b[^0-9]{0,12}${year}`, 'i'));
  return { year, month: mm ? monthOf(mm[1]) : null };
}

/**
 * Numbered newsletters come out at a steady rate, so issue number predicts
 * the year. Fit a line through the dated issues (Theil–Sen, robust to the
 * odd wrong guess) and replace years more than two off it.
 */
export function fixNumberedDates(issues) {
  const pts = issues.map((is) => ({ is, n: Number(String(is.number || '').match(/(\d+)\s*$/)?.[1]) })).filter((p) => p.n && p.is.year);
  if (pts.length < 6) return 0;
  const slopes = [];
  for (let a = 0; a < pts.length; a++)
    for (let b = a + 1; b < pts.length; b++) if (pts[a].n !== pts[b].n) slopes.push((pts[b].is.year - pts[a].is.year) / (pts[b].n - pts[a].n));
  const median = (xs) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  const slope = median(slopes);
  const icept = median(pts.map((p) => p.is.year - slope * p.n));
  let fixed = 0;
  for (const p of pts) {
    const want = Math.round(icept + slope * p.n);
    if (Math.abs(p.is.year - want) > 2) {
      p.is.year = want;
      p.is.month = null;
      fixed++;
    }
  }
  return fixed;
}

/** Page texts from an ABBYY-derived djvu.xml: one OBJECT per page, WORDs in LINEs. */
export function pagesFromDjvuXml(xml) {
  const ent = (s) =>
    s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()],
    );
  return (xml.match(/<OBJECT[\s\S]*?<\/OBJECT>/g) || []).map((obj) =>
    clean(
      (obj.match(/<LINE>[\s\S]*?<\/LINE>/g) || [])
        .map((line) => (line.match(/<WORD[^>]*>([\s\S]*?)<\/WORD>/g) || []).map((w) => ent(w.replace(/<[^>]+>/g, ''))).join(' '))
        .join('\n'),
    ),
  );
}

/* ── Internet Archive ──────────────────────────────────────────────── */

async function search(q, fields = ['identifier', 'title', 'date']) {
  const params = new URLSearchParams({ q, rows: '2000', output: 'json' });
  for (const f of fields) params.append('fl[]', f);
  const res = await fetch(`https://archive.org/advancedsearch.php?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`archive.org search ${res.status}`);
  return (await res.json()).response.docs;
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

async function fetchBuf(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } }).catch((e) => ({ ok: false, status: e.message }));
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt >= 3 || !(res.status >= 500 || res.status === 429 || typeof res.status === 'string')) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

/** Page texts of one issue, cached as extracted pages rather than the raw OCR files. */
async function readPages(is) {
  const file = path.join(CACHE, 'journals', `${is.id.replace(/[^\w.-]+/g, '_')}.pages.json.gz`);
  try {
    if ((await stat(file)).size > 0) return JSON.parse(gunzipSync(await readFile(file)));
  } catch {}
  const base = `https://archive.org/download/${encodeURIComponent(is.item)}/${encodeURIComponent(is.file)}`;
  let pages;
  if (is.text === 'hocr') {
    const text = gunzipSync(await fetchBuf(`${base}_hocr_searchtext.txt.gz`)).toString('utf8');
    const index = JSON.parse(gunzipSync(await fetchBuf(`${base}_hocr_pageindex.json.gz`)));
    const cps = Array.from(text); // offsets count code points
    pages = index.map(([a, b]) => clean(cps.slice(a, b).join('')));
  } else {
    pages = pagesFromDjvuXml((await fetchBuf(`${base}_djvu.xml`)).toString('utf8'));
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, gzipSync(JSON.stringify(pages)));
  return pages;
}

async function listApro() {
  const docs = await search('collection:ufonewsletters AND title:(APRO Bulletin)');
  return docs
    .map((d) => ({ d, date: parseAproId(d.identifier) }))
    .filter((x) => x.date)
    .map(({ d, date }) => ({ id: d.identifier, series: 'apro', item: d.identifier, file: d.identifier, sub: false, text: 'djvu', title: SERIES.apro.name, ...date }));
}

async function listNicap() {
  const docs = await search('collection:pub_u-f-o-investigator');
  return docs
    .map((d) => ({ d, date: parseNicap(d.identifier, d.date, d.title) }))
    .filter((x) => x.date)
    .map(({ d, date }) => ({ id: d.identifier, series: 'nicap', item: d.identifier, file: d.identifier, sub: false, text: 'hocr', title: SERIES.nicap.name, ...date }));
}

async function listIur() {
  const meta = JSON.parse((await cached('journals/iur-metadata.json', `https://archive.org/metadata/${IUR_ITEM}`)).toString('utf8'));
  const names = new Set(meta.files.map((f) => f.name));
  return meta.files
    .filter((f) => /\.pdf$/i.test(f.name))
    .map((f) => f.name.replace(/\.pdf$/i, ''))
    .filter((s) => names.has(`${s}_hocr_searchtext.txt.gz`) && names.has(`${s}_hocr_pageindex.json.gz`))
    .map((s) => ({ s, date: parseIurName(s) }))
    .filter((x) => x.date)
    .map(({ s, date }) => ({ id: `iur/${s}`, series: 'iur', item: IUR_ITEM, file: s, sub: true, text: 'hocr', title: SERIES.iur.name, ...date }));
}

/** MUFON chapter newsletters, grouped by chapter in mufon.json. */
async function listChapters() {
  const { chapters } = JSON.parse(await readFile(path.join(ROOT, 'public/data/mufon.json'), 'utf8'));
  const out = [];
  for (const c of chapters)
    for (const [id, title, date] of c.items) {
      const y = +String(date || '').slice(0, 4);
      const fromId = `${id} ${title}`.match(/\b(19[7-9]\d|20[0-2]\d)\b(?:\D{1,3}(\d{2})\b)?/);
      const guess = y >= 1969 ? { year: y, month: +String(date).slice(5, 7) || null } : fromId ? { year: +fromId[1], month: +fromId[2] <= 12 ? +fromId[2] || null : null } : null;
      const no = title.match(/\b(?:No|Nr|Number|Issue)\.?\s*(\d{1,4})\b/i);
      out.push({ id, series: 'chapters', item: id, file: id, sub: false, text: 'djvu', title: c.name, number: no ? `No. ${+no[1]}` : null, monthTo: null, ...(guess || { year: null, month: null }) });
    }
  return out;
}

/* ── Build ─────────────────────────────────────────────────────────── */

async function main() {
  const lists = await Promise.all([listApro(), listNicap(), listIur(), listChapters()]);
  const all = lists.flat();
  console.log(Object.fromEntries(Object.keys(SERIES).map((k, i) => [k, lists[i].length])));

  const loaded = await mapLimit(all, 4, async (is, i) => {
    try {
      const pages = await readPages(is);
      if (i % 50 === 0) console.log(`  ${i}/${all.length} ${is.id}`);
      if (!pages.some((p) => p.length > 200)) return null; // no usable OCR
      const dated = is.year ? is : { ...is, ...dateFromText(pages, undefined, is.series === 'chapters' ? 1969 : 1940) };
      return dated.year ? { ...dated, pages, cover: false } : null;
    } catch (e) {
      console.warn(`Skipping ${is.id}: ${e.message}`);
      return null;
    }
  });
  const chapterGroups = new Map();
  for (const is of loaded.filter((x) => x?.series === 'chapters')) {
    if (!chapterGroups.has(is.title)) chapterGroups.set(is.title, []);
    chapterGroups.get(is.title).push(is);
  }
  let refit = 0;
  for (const group of chapterGroups.values()) refit += fixNumberedDates(group);
  console.log(`Chapter newsletter dates corrected from issue numbers: ${refit}`);
  // The same APRO issue is sometimes scanned twice; keep the fuller scan.
  const byKey = new Map();
  for (const is of loaded.filter(Boolean)) {
    const key = is.series === 'apro' ? `apro|${is.year}|${is.month}|${is.number || ''}` : is.id;
    const len = (x) => x.pages.reduce((n, p) => n + p.length, 0);
    if (!byKey.has(key) || len(is) > len(byKey.get(key))) byKey.set(key, is);
  }
  const issues = [...byKey.values()].sort(
    (a, b) => Object.keys(SERIES).indexOf(a.series) - Object.keys(SERIES).indexOf(b.series) || a.year - b.year || (a.month || 0) - (b.month || 0) || a.id.localeCompare(b.id),
  );
  console.log(`Issues with OCR: ${issues.length}`);

  const gz = await loadGazetteer();
  const { raw, placeNames, places } = extractPlaces(issues, makeResolvers(gz), (is) => `${is.series}|${is.title}`);
  console.log(`Place mentions: ${raw} found, ${places.length} kept, ${placeNames.length} distinct places`);

  const { CASES } = await import('../src/data/cases/index.js');
  const cases = matchCases(issues, CASES, gz);
  console.log(`Curated cases with coverage: ${Object.keys(cases).length}/${CASES.length}`);

  const payload = {
    generated: new Date().toISOString(),
    source:
      'Scans on the Internet Archive: APRO Bulletin and MUFON chapter newsletters (Archives for the Unexplained, collection ufonewsletters), The U.F.O. Investigator (NICAP; Serials in Microfilm), International UFO Reporter (CUFOS; item iur-vol.-31-no.-4). Places found automatically in the OCR text and geocoded with GeoNames (CC BY 4.0).',
    series: SERIES,
    issueFields: ['id', 'series', 'item', 'file', 'sub', 'text', 'year', 'month', 'monthTo', 'number', 'title', 'pages'],
    issues: issues.map((is) => [is.id, is.series, is.item, is.file, is.sub ? 1 : 0, is.text, is.year, is.month, is.monthTo, is.number, is.title, is.pages.length]),
    placeFields: ['lat', 'lon', 'issue', 'leaf', 'place', 'quote'],
    placeNames,
    places,
    cases,
  };
  await writeFile(OUT, JSON.stringify(payload) + '\n');
  console.log(`Wrote ${OUT} (${(JSON.stringify(payload).length / 1e6).toFixed(2)} MB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
