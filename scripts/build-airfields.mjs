#!/usr/bin/env node
/**
 * Build public/data/airfields.json: the world's airports and airfields that
 * matter for "was it an aircraft?" (large and medium airports, and small ones
 * with an ICAO code or scheduled flights, plus military fields by name), from
 * OurAirports (public domain).
 *
 *   node scripts/build-airfields.mjs [path/to/airports.csv]
 *
 * Output: { generated, source, license, fields, airfields } where each airfield
 * is [name, lat, lon, size, code, country, military] with size 0 large, 1
 * medium, 2 small. Closed airports, heliports, seaplane bases and balloon
 * ports are left out. The data says what exists now, not what existed when
 * a case happened.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const SIZE = { large_airport: 0, medium_airport: 1, small_airport: 2 };
const MILITARY = /\b(air force base|air base|afb|naval air|nas|army air ?field|army airfield|marine corps air|raf|usaf|military|airbase|base a[eé]rea|b[aá]se a[eé]rea|aeroporto militar|fliegerhorst|luftwaffe|air station)\b/i;

/** A CSV text as rows of fields (quotes, doubled quotes and line breaks inside quotes as in RFC 4180). */
export function parseCsv(text) {
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
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** The airfields worth keeping from the OurAirports CSV text. */
export function airfieldsFrom(text) {
  const [head, ...rows] = parseCsv(text);
  const col = Object.fromEntries(head.map((name, i) => [name, i]));
  const out = [];
  for (const r of rows) {
    const size = SIZE[r[col.type]];
    if (size == null) continue;
    const lat = Number(r[col.latitude_deg]);
    const lon = Number(r[col.longitude_deg]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const name = r[col.name].trim();
    const military = MILITARY.test(name);
    const code = r[col.icao_code] || r[col.gps_code] || r[col.ident];
    if (size === 2 && !(r[col.icao_code] || r[col.scheduled_service] === 'yes' || military)) continue;
    out.push([name, Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, size, code, r[col.iso_country], military ? 1 : 0]);
  }
  return out.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
}

async function main() {
  const file = process.argv[2];
  const text = file ? await readFile(file, 'utf8') : await (await fetch(SOURCE)).text();
  const airfields = airfieldsFrom(text);
  const json = { generated: new Date().toISOString().slice(0, 10), source: SOURCE, license: 'Public domain (OurAirports)', fields: ['name', 'lat', 'lon', 'size', 'code', 'country', 'military'], airfields };
  await writeFile(path.join(ROOT, 'public/data/airfields.json'), `${JSON.stringify(json)}\n`);
  console.log(`public/data/airfields.json: ${airfields.length} airfields`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
