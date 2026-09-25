#!/usr/bin/env node
/**
 * Build public/data/airspace.json: U.S. special-use airspace (restricted,
 * warning, military operations, alert, prohibited and danger areas) from the
 * FAA's open ArcGIS service, simplified for the browser.
 *
 *   node scripts/build-airspace.mjs
 *
 * Output: { generated, source, types, features: [[name, type, lowerFt, upperFt,
 *   city, state, timesOfUse, controller, polygons]] } where polygons is an array
 *   of polygons, each an array of rings, each a flat [lon, lat, lon, lat, …].
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVICE = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0/query';
const FIELDS = 'NAME,TYPE_CODE,UPPER_VAL,UPPER_UOM,UPPER_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,CITY,STATE,TIMESOFUSE,CONT_AGENT';
export const TYPES = {
  R: 'Restricted area',
  W: 'Warning area',
  MOA: 'Military operations area',
  A: 'Alert area',
  P: 'Prohibited area',
  D: 'Danger area',
};

/** Altitude in feet from the FAA value/unit/code triple. Unlimited is stored as 99,999. */
export function altitudeFt(val, uom, code) {
  if (code === 'UNLTD' || Number(val) <= -9000) return 99999;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return uom === 'FL' ? n * 100 : n;
}

const round = (x) => Math.round(x * 1e4) / 1e4;

async function page(offset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: FIELDS,
    outSR: '4326',
    f: 'geojson',
    maxAllowableOffset: '0.004',
    geometryPrecision: '4',
    resultOffset: String(offset),
    resultRecordCount: '500',
    orderByFields: 'OBJECTID',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${SERVICE}?${params}`);
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(`FAA service failed at offset ${offset}`);
}

async function main() {
  const features = [];
  for (let offset = 0; ; offset += 500) {
    const json = await page(offset);
    const batch = json.features || [];
    for (const f of batch) {
      const a = f.properties;
      if (!f.geometry || !TYPES[a.TYPE_CODE]) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      const flat = polys.map((rings) => rings.map((ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)])));
      features.push([
        a.NAME,
        a.TYPE_CODE,
        altitudeFt(a.LOWER_VAL, a.LOWER_UOM, a.LOWER_CODE) ?? 0,
        altitudeFt(a.UPPER_VAL, a.UPPER_UOM, a.UPPER_CODE) ?? 18000,
        a.CITY || '',
        a.STATE || '',
        a.TIMESOFUSE || '',
        a.CONT_AGENT || '',
        flat,
      ]);
    }
    process.stdout.write(`\r${features.length} areas`);
    if (batch.length < 500) break;
  }
  const out = {
    generated: new Date().toISOString(),
    source: 'FAA Aeronautical Information Services — Special Use Airspace (ArcGIS open data)',
    types: TYPES,
    features,
  };
  await mkdir(path.join(ROOT, 'public/data'), { recursive: true });
  const file = path.join(ROOT, 'public/data/airspace.json');
  await writeFile(file, JSON.stringify(out));
  console.log(`\nWrote ${features.length} areas to ${path.relative(ROOT, file)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
