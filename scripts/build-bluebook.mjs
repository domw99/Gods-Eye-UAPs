#!/usr/bin/env node
/**
 * Build the Project Blue Book layer.
 *
 * Project Blue Book (U.S. Air Force, 1952–1969, with its predecessors Sign
 * and Grudge from 1947) collected 12,618 UFO reports. The National Archives
 * microfilm was scanned and mirrored to the Internet Archive collection
 * `project-blue-book` as ~10,700 case files named `YYYY-MM-<id>-City-State`.
 *
 * This script lists that collection, geocodes each file name offline with
 * GeoNames (cities1000, CC BY 4.0) and writes public/data/bluebook.json.
 * Nothing is sent to a geocoding service.
 *
 *   node scripts/build-bluebook.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, UA, norm, loadGazetteer, regionCentroid, resolveRegionToken } from './lib/geonames.mjs';

const OUT = path.join(ROOT, 'public/data/bluebook.json');

const splitCamel = (s) =>
  s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2');

function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// "31-50N173-00E", "40N173W", "12Deg30N-81Deg10W", "37degrees57N125degrees31E"
const COORD =
  /(\d{1,2})\s*(?:deg(?:rees)?)?\s*-?\s*(\d{1,2}(?:\.\d+)?)?\s*([NS])\s*(?:and)?\s*-?\s*(\d{1,3})\s*(?:deg(?:rees)?)?\s*-?\s*(\d{1,2}(?:\.\d+)?)?\s*([EW])(?![a-z])/i;
// Compact degrees+minutes: "2400N-8520W" → 24°00′N 85°20′W
const COORD_COMPACT = /\b(\d{2})(\d{2})([NS])\W*(\d{2,3})(\d{2})([EW])\b/i;

export function parseIdentifier(id) {
  const m = id.match(/^(\d{4})-([A-Za-z]+|\d{1,2})-(\d+)-?(.*)$/);
  if (!m) return null;
  const [, year, month, naid, rest] = m;
  const tokens = rest
    .split('-')
    .map((t) => t.trim())
    .filter((t) => t && !/^\d+$/.test(t) && !/^(illegible|blank|unknown)$/i.test(t));
  return { year: +year, month: /^\d+$/.test(month) ? +month : null, naid, tokens, rest };
}

function geocode(gz, parsed) {
  const { tokens, rest } = parsed;
  const compact = rest.match(COORD_COMPACT);
  if (compact) {
    let lat = +compact[1] + +compact[2] / 60;
    let lon = +compact[4] + +compact[5] / 60;
    if (/s/i.test(compact[3])) lat = -lat;
    if (/w/i.test(compact[6])) lon = -lon;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
      return { lat, lon, precision: 'site', place: compact[0].toUpperCase() };
  }
  const coord = rest.match(COORD);
  if (coord) {
    let lat = +coord[1] + (+coord[2] || 0) / 60;
    let lon = +coord[4] + (+coord[5] || 0) / 60;
    if (/s/i.test(coord[3])) lat = -lat;
    if (/w/i.test(coord[6])) lon = -lon;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
      return { lat, lon, precision: 'site', place: `${coord[0].toUpperCase()}` };
  }
  if (!tokens.length) return null;

  // Try progressively shorter tails as the region (handles "N-M", "New-York").
  let region = null;
  let cityTokens = tokens;
  for (let k = Math.min(2, tokens.length); k >= 1 && !region; k--) {
    const r = resolveRegionToken(gz, tokens.slice(-k).join(''));
    if (r) {
      region = r;
      cityTokens = tokens.slice(0, -k);
    }
  }

  const cleaned = splitCamel(cityTokens.join(' '))
    .replace(/\b(vicinity|vic|visc|near|nr|of|over|area|outside)\b/gi, ' ')
    .replace(/\b\d+\s*mi(les?)?\s*[nsew]{1,3}\b/gi, ' ')
    .replace(/\b[nsew]{1,3}\s*of\b/gi, ' ')
    .replace(/\bAFB\b|\bAir ?Force ?Base\b|\bAFS\b|\bAAF\b|\bNAS\b|\bAB\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates = [];
  const words = cleaned.split(' ').filter(Boolean);
  // Try the full name, then trailing sub-phrases ("Between Tonopah And Las Vegas" → "Las Vegas").
  for (let i = 0; i < words.length; i++) candidates.push(words.slice(i).join(' '));
  for (let i = words.length - 1; i > 0; i--) candidates.push(words.slice(0, i).join(' '));

  const inRegion = (rec) =>
    !region ||
    (region.key.includes('.') ? `${rec.cc}.${rec.a1}` === region.key : rec.cc === region.key);

  for (const cand of candidates) {
    const key = norm(cand);
    if (key.length < 3) continue;
    const hits = (gz.byName.get(key) || []).filter(inRegion);
    if (hits.length) {
      const best = hits.sort((a, b) => b.pop - a.pop)[0];
      // Without a state/country, a name shared by several places is a guess.
      const ambiguous = !region && hits.some((h) => h.cc !== best.cc || h.a1 !== best.a1);
      return {
        lat: best.lat,
        lon: best.lon,
        precision: ambiguous ? 'region' : 'city',
        place: `${best.name}${region ? `, ${region.label}` : ''}`,
      };
    }
  }
  // Fuzzy match inside the region only (misspellings like "Witchita", "Charlston").
  if (region && cleaned) {
    const key = norm(cleaned);
    if (key.length >= 6) {
      let best = null;
      for (const rec of gz.byRegion.get(region.key) || []) {
        const d = editDistance(key, norm(rec.name), 2);
        if (d <= 2 && (!best || d < best.d || (d === best.d && rec.pop > best.rec.pop)))
          best = { d, rec };
      }
      if (best)
        return {
          lat: best.rec.lat,
          lon: best.rec.lon,
          precision: 'city',
          place: `${best.rec.name}, ${region.label}`,
        };
    }
  }
  if (region) {
    const c = region.lat != null ? region : regionCentroid(gz, region.key);
    if (c)
      return {
        lat: c.lat,
        lon: c.lon,
        precision: 'region',
        place: `${cleaned ? `${cleaned}, ` : ''}${region.label}`,
      };
  }
  return null;
}

async function listCollection() {
  const items = [];
  let cursor;
  do {
    const q = new URLSearchParams({
      q: 'collection:project-blue-book',
      fields: 'identifier',
      count: '10000',
    });
    if (cursor) q.set('cursor', cursor);
    const res = await fetch(`https://archive.org/services/search/v1/scrape?${q}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`archive.org ${res.status}`);
    const data = await res.json();
    items.push(...data.items.map((x) => x.identifier));
    cursor = data.cursor;
  } while (cursor);
  return items;
}

async function main() {
  const gz = await loadGazetteer();
  const ids = await listCollection();
  console.log(`Blue Book files: ${ids.length}`);
  const records = [];
  const stats = { site: 0, city: 0, region: 0, none: 0 };
  const unplaced = [];
  for (const id of ids.sort()) {
    const parsed = parseIdentifier(id);
    if (!parsed) {
      stats.none++;
      unplaced.push(id);
      continue;
    }
    const g = geocode(gz, parsed);
    if (!g) {
      stats.none++;
      unplaced.push(id);
      records.push([id, null, null, 0, splitCamel(parsed.tokens.join(' ')) || 'Unknown location']);
      continue;
    }
    stats[g.precision]++;
    records.push([
      id,
      +g.lat.toFixed(4),
      +g.lon.toFixed(4),
      { site: 3, city: 2, region: 1 }[g.precision],
      g.place,
    ]);
  }
  const payload = {
    generated: new Date().toISOString(),
    source:
      'Project Blue Book case files (U.S. Air Force, NARA microfilm T1206) mirrored on the Internet Archive collection "project-blue-book". Locations geocoded from file names with GeoNames (CC BY 4.0).',
    fields: ['identifier', 'lat', 'lon', 'precision(3=site,2=city,1=region,0=none)', 'place'],
    stats,
    count: records.length,
    records,
  };
  await writeFile(OUT, JSON.stringify(payload) + '\n');
  console.log(stats);
  console.log('Sample unplaced:', unplaced.slice(0, 40).join(', '));
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
