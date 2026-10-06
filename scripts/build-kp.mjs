#!/usr/bin/env node
/**
 * Build public/data/kp.json: the planetary geomagnetic Kp index, every three
 * hours since 1932, from GFZ Potsdam (CC BY 4.0).
 *
 *   node scripts/build-kp.mjs [path/to/Kp_ap_since_1932.txt]
 *
 * Output: { generated, source, license, start, step, values } where `values` is
 * one character per three-hour interval counted from `start` (00:00 UT): the
 * Kp in thirds (0 to 27, so 5- is 14 and 5o is 15) as a base-36 digit, or '.'
 * where the index is missing. The file's own lines are checked to follow each
 * other without a gap.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/is-main.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = 'https://kp.gfz.de/app/files/Kp_ap_since_1932.txt';
export const START = '1932-01-01';

/** The packed string for the data lines of the GFZ file. */
export function pack(text) {
  const out = [];
  let expected = 0;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const f = line.trim().split(/\s+/);
    const days = Math.round(Number(f[5]) * 8); // days since the start, in intervals of three hours
    const kp = Number(f[7]);
    if (days !== expected) throw new Error(`Kp file skips from interval ${expected} to ${days} (${f.slice(0, 4).join(' ')})`);
    expected++;
    out.push(kp < 0 ? '.' : Math.round(kp * 3).toString(36));
  }
  // An empty answer (an error page, an empty file) must not replace the series: the monthly workflow commits what this writes.
  if (!out.length) throw new Error('No Kp lines in the file');
  return out.join('');
}

async function download() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${res.status} ${SOURCE}`);
  return res.text();
}

async function main() {
  const file = process.argv[2];
  const text = file ? await readFile(file, 'utf8') : await download();
  const values = pack(text);
  const json = { generated: new Date().toISOString().slice(0, 10), source: SOURCE, license: 'CC BY 4.0, GFZ Helmholtz Centre for Geosciences (Matzka et al. 2021)', start: START, step: 3, values };
  await writeFile(path.join(ROOT, 'public/data/kp.json'), `${JSON.stringify(json)}\n`);
  console.log(`public/data/kp.json: ${values.length} intervals, ${START} to ${new Date(Date.parse(START) + (values.length / 8) * 864e5).toISOString().slice(0, 10)}`);
}

if (isMain(import.meta.url)) await main();
