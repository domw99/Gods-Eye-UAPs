#!/usr/bin/env node
/**
 * Build the civilian-report density layer from NUFORC (National UFO Reporting
 * Center) data, using the geocoded, time-normalised scrape published at
 * github.com/planetsig/ufo-reports (~80,000 reports, 1906–2014).
 *
 * Only factual fields are kept (date, place, coordinates, shape, duration);
 * witness narratives are dropped. These are unverified public reports — the
 * layer shows where people report things, not what they saw.
 *
 *   node scripts/build-nuforc.mjs
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'public/data/nuforc.json');
const SRC =
  'https://raw.githubusercontent.com/planetsig/ufo-reports/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv';

async function cached(name, url) {
  const file = path.join(CACHE, name);
  try {
    if ((await stat(file)).size > 0) return readFile(file, 'utf8');
  } catch {}
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, text);
  return text;
}

/** RFC-4180-ish CSV line splitter (the file has quoted commas). */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const title = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

async function main() {
  const csv = await cached('nuforc-scrubbed.csv', SRC);
  const lines = csv.split(/\r?\n/);
  const shapes = [];
  const shapeIdx = new Map();
  const places = [];
  const placeIdx = new Map();
  const cols = { lat: [], lon: [], date: [], shape: [], dur: [], place: [] };
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const f = splitCsv(line);
    if (f.length < 11) { skipped++; continue; }
    const [dt, city, state, country, shapeRaw, durSec] = f;
    const lat = parseFloat(f[9]);
    const lon = parseFloat(f[10]);
    const m = dt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      skipped++;
      continue;
    }
    const year = +m[3];
    const date = year * 10000 + +m[1] * 100 + +m[2]; // YYYYMMDD
    const shape = (shapeRaw || 'unknown').trim().toLowerCase() || 'unknown';
    if (!shapeIdx.has(shape)) { shapeIdx.set(shape, shapes.length); shapes.push(shape); }
    const place = [title(city.replace(/&#44;?/g, ',').replace(/&amp;/g, '&').trim()), state.trim().toUpperCase(), country.trim().toUpperCase()]
      .filter(Boolean)
      .join(', ');
    if (!placeIdx.has(place)) { placeIdx.set(place, places.length); places.push(place); }
    cols.lat.push(Math.round(lat * 1000) / 1000);
    cols.lon.push(Math.round(lon * 1000) / 1000);
    cols.date.push(date);
    cols.shape.push(shapeIdx.get(shape));
    cols.dur.push(Math.min(Math.round(parseFloat(durSec) || 0), 604800));
    cols.place.push(placeIdx.get(place));
  }
  const payload = {
    generated: new Date().toISOString(),
    source:
      'NUFORC public reports via github.com/planetsig/ufo-reports (geocoded, time-normalised). Narratives removed; unverified civilian reports.',
    count: cols.lat.length,
    shapes,
    places,
    ...cols,
  };
  await writeFile(OUT, JSON.stringify(payload));
  console.log(`Wrote ${cols.lat.length} reports (${skipped} skipped), ${shapes.length} shapes`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
