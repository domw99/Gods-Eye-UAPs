#!/usr/bin/env node
/**
 * Sync the official U.S. government UAP footage catalogue from DVIDS.
 *
 * The Department of War publishes every PURSUE / AARO release (war.gov/UFO)
 * through DVIDS, the Defense Visual Information Distribution Service. This
 * script walks DVIDS search results for UAP-related assets, reads each asset
 * page (title, date taken, description, thumbnail, duration) and writes a
 * compact catalogue to public/data/official-uap-media.json.
 *
 * Locations in official releases are usually given only at region level
 * ("Gulf of Oman", "Eastern United States"). Those are placed at a region
 * centroid and flagged `precision: "region"` so the UI never implies a pin
 * is an exact position.
 *
 *   node scripts/sync-dvids.mjs            # full sync
 *   node scripts/sync-dvids.mjs --max 20   # quick partial run
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveRegion } from '../src/data/regions.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public/data/official-uap-media.json');
const UA =
  'GodsEyeUAP/0.1 (+https://github.com/domw99/Gods-Eye-UAPs) catalogue sync';
const QUERIES = [
  'UAP',
  'Unresolved UAP Report',
  'Resolved UAP',
  'DOW-UAP',
  'FBI-UAP',
  'LLE-UAP',
  'NASA-UAP',
  'AARO',
  'All-domain Anomaly Resolution Office',
  'unidentified anomalous phenomena',
];
const TYPES = ['video', 'image'];
const RELEVANT =
  /\b(UAP|UAPs|AARO|UFO|UFOs|anomalous|PURSUE|Puerto Rico object|satellite flaring|Tremonton)\b/i;
// Search hits are pre-filtered on the URL slug (derived from the title) so
// unrelated assets that merely mention a query word are never downloaded.
const RELEVANT_SLUG =
  /(^|-)(uap|uaps|ufo|ufos|aaro|anomal\w*|pursue|tremonton)(-|$)|puerto-rico-object|satellite-flaring/i;
const args = process.argv.slice(2);
const MAX = Number(args[args.indexOf('--max') + 1]) || Infinity;
const DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 4) throw new Error(`${res.status} ${url}`);
    await sleep(2000 * (attempt + 1));
    return fetchText(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function meta(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`,
    'i',
  );
  return decode(html.match(re)?.[1] || '');
}

function infoRow(html, label) {
  const re = new RegExp(`<td>${label}:</td>\\s*<td>([\\s\\S]*?)</td>`, 'i');
  return decode(html.match(re)?.[1] || '');
}

async function discover() {
  const found = new Map();
  for (const type of TYPES) {
    for (const q of QUERIES) {
      let idle = 0;
      for (let page = 1; page <= 40; page++) {
        const url = `https://www.dvidshub.net/search/?q=${encodeURIComponent(q)}&filter%5Btype%5D=${type}&sort=date&page=${page}`;
        let html;
        try {
          html = await fetchText(url);
        } catch (e) {
          console.warn('search failed', url, e.message);
          break;
        }
        const re = new RegExp(`href="/${type}/(\\d+)/([^"#?]+)"`, 'g');
        let added = 0;
        for (const m of html.matchAll(re)) {
          const key = `${type}:${m[1]}`;
          if (!RELEVANT_SLUG.test(m[2])) continue;
          if (!found.has(key)) {
            found.set(key, { type, id: m[1], slug: m[2] });
            added++;
          }
        }
        await sleep(DELAY_MS);
        // Stop once a page has no results at all, or several pages in a row
        // add nothing new (DVIDS keeps paging loosely related hits).
        if (!new RegExp(`href="/${type}/\\d+/`).test(html)) break;
        idle = added ? 0 : idle + 1;
        if (idle >= 2) break;
      }
    }
  }
  return [...found.values()];
}

function parseTitle(title) {
  // e.g. `DOW-UAP-PR117, Unresolved UAP Report, Gulf of Oman, 2021`
  //      `PR-017, Unresolved UAP Report, Europe 2024`
  //      `FBI-UAP-PR003, Orbs Over Pond, 2024`
  const idMatch = title.match(
    /^((?:[A-Z]{2,5}-)?UAP-(?:PR|D|IMG|A)-?\d+|PR-\d+)\b/i,
  );
  const releaseId = idMatch ? idMatch[1].toUpperCase() : null;
  const agency = releaseId?.startsWith('FBI')
    ? 'FBI'
    : releaseId?.startsWith('LLE')
      ? 'Local law enforcement'
      : releaseId?.startsWith('NASA')
        ? 'NASA'
        : releaseId?.startsWith('DOW')
          ? 'Department of War'
          : 'AARO';
  const status = /\bresolved\b/i.test(title) && !/unresolved/i.test(title)
    ? 'resolved'
    : /unresolved/i.test(title)
      ? 'unresolved'
      : 'unknown';
  const report = title.match(
    /(?:Unresolved|Resolved)[^,]*UAP Report,?\s*([^,]+?)(?:,?\s*(?:[A-Z][a-z]+\s)?(\d{4}))?\s*$/i,
  );
  const region = report ? report[1].replace(/\s+\d{4}$/, '').trim() : null;
  const year = Number(title.match(/\b(19[4-9]\d|20[0-3]\d)\b(?!.*\b(19|20)\d{2}\b)/)?.[1]) || null;
  return { releaseId, agency, status, region, year };
}

function parseDate(s) {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

async function readAsset({ type, id, slug }) {
  const url = `https://www.dvidshub.net/${type}/${id}/${slug}`;
  const html = await fetchText(url);
  const title = meta(html, 'og:title');
  if (!RELEVANT.test(title) && !RELEVANT.test(meta(html, 'og:description')))
    return null;
  // Full description paragraph sits after the share buttons block.
  const descBlock =
    html.match(
      /sharethis-inline-share-buttons[\s\S]*?<p>([\s\S]*?)<\/p>/i,
    )?.[1] || '';
  const description = decode(descBlock) || meta(html, 'og:description');
  const parsed = parseTitle(title);
  const regionText = parsed.region || '';
  const place = resolveRegion(`${title} ${regionText}`, description);
  return {
    source: 'DVIDS',
    type,
    dvidsId: id,
    title,
    ...parsed,
    dateTaken: parseDate(infoRow(html, 'Date Taken')),
    datePosted: parseDate(infoRow(html, 'Date Posted')),
    duration: infoRow(html, 'Length') || null,
    countryCode: infoRow(html, 'Location') || null,
    description,
    page: url,
    embed: type === 'video' ? `https://www.dvidshub.net/video/embed/${id}` : null,
    thumbnail: meta(html, 'og:image') || null,
    location: place,
  };
}

async function main() {
  let previous = [];
  try {
    previous = JSON.parse(await readFile(OUT, 'utf8')).items || [];
  } catch {}
  if (args.includes('--relocate')) {
    // Re-run only the offline location step (after editing regions.js).
    for (const item of previous)
      item.location = resolveRegion(
        `${item.title} ${item.region || ''}`,
        item.description,
      );
    const payload = JSON.parse(await readFile(OUT, 'utf8'));
    payload.items = previous;
    await writeFile(OUT, JSON.stringify(payload, null, 1) + '\n');
    console.log(`Relocated ${previous.length} items`);
    return;
  }
  console.log('Discovering DVIDS UAP assets…');
  const assets = (await discover()).slice(0, MAX);
  console.log(`Found ${assets.length} candidate assets`);
  const items = [];
  for (const [i, a] of assets.entries()) {
    try {
      const item = await readAsset(a);
      if (item) items.push(item);
      process.stdout.write(`\r${i + 1}/${assets.length} kept ${items.length}`);
    } catch (e) {
      console.warn(`\n${a.type}/${a.id}: ${e.message}`);
      const old = previous.find((p) => p.dvidsId === a.id && p.type === a.type);
      if (old) items.push(old);
    }
    await sleep(DELAY_MS);
  }
  items.sort((a, b) =>
    String(b.dateTaken || b.year || '').localeCompare(
      String(a.dateTaken || a.year || ''),
    ),
  );
  const payload = {
    generated: new Date().toISOString(),
    source:
      'DVIDS (dvidshub.net) — official U.S. Department of War / AARO / PURSUE releases, public domain',
    count: items.length,
    items,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1) + '\n');
  console.log(`\nWrote ${items.length} items to ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
