#!/usr/bin/env node
/**
 * Build public/data/fireballs.json: the bright fireballs (meteors that burst in
 * the atmosphere) detected by U.S. government sensors since 1988, from NASA's
 * Center for Near Earth Object Studies (a U.S. government work, public domain).
 *
 *   node scripts/build-fireballs.mjs [path/to/fireball-api-response.json]
 *
 * Only events with a position are kept. Output: { generated, source, license,
 * fields, events }, where each event is [time (seconds since 1970, UTC),
 * latitude, longitude, radiated energy (10^10 J), impact energy (kt), height (km),
 * speed (km/s)] with null where the sensors gave no value, oldest first.
 * Bolides are brighter than the Moon for a few seconds, so they are a familiar
 * cause of "a light that crossed the sky and went out".
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/is-main.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = 'https://ssd-api.jpl.nasa.gov/fireball.api?req-loc=true';
export const FIELDS = ['time', 'lat', 'lon', 'energy', 'impact', 'height', 'speed'];

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** The API's rows as compact events, oldest first; rows without a time or position are dropped. */
export function pack(response) {
  const names = response?.fields;
  if (!Array.isArray(names) || !Array.isArray(response?.data)) throw new Error('Not a fireball API response');
  const at = (name) => names.indexOf(name);
  const need = ['date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel'];
  for (const n of need) if (at(n) < 0) throw new Error(`Fireball response has no ${n} column`);
  const events = [];
  for (const row of response.data) {
    const ms = Date.parse(`${String(row[at('date')]).replace(' ', 'T')}Z`);
    const lat = num(row[at('lat')]);
    const lon = num(row[at('lon')]);
    if (!Number.isFinite(ms) || lat == null || lon == null) continue;
    const sLat = row[at('lat-dir')] === 'S' ? -1 : 1;
    const sLon = row[at('lon-dir')] === 'W' ? -1 : 1;
    if (lat > 90 || lon > 180) continue;
    events.push([ms / 1000, sLat * lat, sLon * lon, num(row[at('energy')]), num(row[at('impact-e')]), num(row[at('alt')]), num(row[at('vel')])]);
  }
  // An empty answer (an error page) must not replace the series: the monthly workflow commits what this writes.
  if (!events.length) throw new Error('No fireballs with a position in the response');
  return events.sort((a, b) => a[0] - b[0]);
}

async function download() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${res.status} ${SOURCE}`);
  return res.json();
}

async function main() {
  const file = process.argv[2];
  const response = file ? JSON.parse(await readFile(file, 'utf8')) : await download();
  const events = pack(response);
  const json = { generated: new Date().toISOString().slice(0, 10), source: 'https://cneos.jpl.nasa.gov/fireballs/', license: 'NASA/JPL CNEOS, U.S. government data (public domain)', fields: FIELDS, events };
  await writeFile(path.join(ROOT, 'public/data/fireballs.json'), `${JSON.stringify(json)}\n`);
  console.log(`public/data/fireballs.json: ${events.length} fireballs, ${new Date(events[0][0] * 1000).toISOString().slice(0, 10)} to ${new Date(events.at(-1)[0] * 1000).toISOString().slice(0, 10)}`);
}

if (isMain(import.meta.url)) await main();
