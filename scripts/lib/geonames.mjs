/**
 * Offline place lookup shared by the data builds: a download cache, a tiny
 * ZIP reader and the GeoNames cities1000 gazetteer (CC BY 4.0). Nothing is
 * sent to a geocoding service.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { US_STATES, REGION_ALIASES } from './gazetteer.mjs';

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const CACHE = path.join(ROOT, '.cache');
export const UA = 'GodsEyeUAP/0.1 (+https://github.com/domw99/Gods-Eye-UAPs) data build';

/** Download once into .cache/<name> and reuse it on later runs. */
export async function cached(name, url) {
  const file = path.join(CACHE, name);
  try {
    if ((await stat(file)).size > 0) return readFile(file);
  } catch {}
  console.log(`Downloading ${url}`);
  let res;
  // Retry server errors and rate limits with a growing pause (archive.org is busy at times).
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { headers: { 'User-Agent': UA } }).catch((e) => ({ ok: false, status: e.message }));
    if (res.ok || attempt >= 3 || !(res.status >= 500 || res.status === 429 || typeof res.status === 'string')) break;
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return buf;
}

/** Minimal reader for a single-file ZIP (GeoNames dumps). */
export function unzipFirst(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  return method === 0 ? data : inflateRawSync(data);
}

export const norm = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bfort\b/g, 'ft')
    .replace(/\bmount\b/g, 'mt')
    .replace(/[^a-z0-9]/g, '');

export async function loadGazetteer() {
  const cities = unzipFirst(
    await cached('cities1000.zip', 'https://download.geonames.org/export/dump/cities1000.zip'),
  ).toString('utf8');
  const countryInfo = (
    await cached('countryInfo.txt', 'https://download.geonames.org/export/dump/countryInfo.txt')
  ).toString('utf8');

  const byName = new Map(); // norm name -> [{lat, lon, cc, a1, pop, name}]
  const byRegion = new Map(); // "CC" or "CC.A1" -> [city...]
  const add = (key, rec) => {
    if (!key) return;
    let list = byName.get(key);
    if (!list) byName.set(key, (list = []));
    if (!list.includes(rec)) list.push(rec);
  };
  for (const line of cities.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    const rec = {
      name: f[1],
      lat: +f[4],
      lon: +f[5],
      cc: f[8],
      a1: f[10],
      pop: +f[14] || 0,
    };
    add(norm(f[1]), rec);
    add(norm(f[2]), rec);
    // Alternate names help with "StJohns", "AFB" CDPs and older spellings.
    if (f[3] && (rec.cc === 'US' || rec.cc === 'CA' || rec.pop > 50000))
      for (const alt of f[3].split(',')) if (/^[\x20-\x7e]+$/.test(alt)) add(norm(alt), rec);
    for (const key of [rec.cc, `${rec.cc}.${rec.a1}`]) {
      let list = byRegion.get(key);
      if (!list) byRegion.set(key, (list = []));
      list.push(rec);
    }
  }
  const countries = new Map();
  for (const line of countryInfo.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const f = line.split('\t');
    countries.set(norm(f[4]), { cc: f[0], name: f[4] });
  }
  return { byName, byRegion, countries };
}

export function regionCentroid(gz, key) {
  const list = gz.byRegion.get(key);
  if (!list?.length) return null;
  let w = 0, lat = 0, lon = 0;
  for (const c of list) {
    const k = Math.sqrt(c.pop + 1);
    w += k; lat += c.lat * k; lon += c.lon * k;
  }
  return { lat: lat / w, lon: lon / w };
}

/** Map a region token ("Florida", "Calif", "N-M", "Japan") to a key. */
export function resolveRegionToken(gz, token) {
  const n = norm(token).replace(/(area|vicinity|region)$/, '');
  if (!n) return null;
  if (US_STATES[n]) return { key: `US.${US_STATES[n].code}`, label: US_STATES[n].name, cc: 'US' };
  if (REGION_ALIASES[n]) return REGION_ALIASES[n];
  const country = gz.countries.get(n);
  if (country) return { key: country.cc, label: country.name, cc: country.cc };
  return null;
}

/** Does a gazetteer record fall inside a resolved region? */
export const inRegion = (region, rec) =>
  !region || (region.key.includes('.') ? `${rec.cc}.${rec.a1}` === region.key : rec.cc === region.key);
