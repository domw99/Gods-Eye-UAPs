#!/usr/bin/env node
/**
 * Verify every external reference used by the curated case files:
 *   - Wikimedia Commons files exist (batched API query)
 *   - Wikipedia article titles resolve
 *   - DVIDS ids exist in the synced official catalogue
 *   - Project Blue Book identifiers exist in the Blue Book layer
 *   - Gov-file Commons documents exist
 * Exits non-zero when anything is missing.
 *
 *   node scripts/verify-media.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from '../src/data/cases/index.js';
import { GOV_FILES } from '../src/data/govFiles.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const UA = 'GodsEyeUAP/0.1 (+https://github.com/domw99/Gods-Eye-UAPs) media verification';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(host, params) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    if (res.status === 429) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`rate limited: ${url}`);
}

async function missingTitles(host, titles) {
  const missing = [];
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const data = await api(host, { action: 'query', titles: chunk.join('|'), redirects: '1' });
    const q = data.query;
    const norm = new Map((q.normalized || []).map((n) => [n.from, n.to]));
    const red = new Map((q.redirects || []).map((r) => [r.from, r.to]));
    const pages = new Map(q.pages.map((pg) => [pg.title, pg]));
    for (const t of chunk) {
      let k = norm.get(t) || t;
      k = red.get(k) || k;
      const pg = pages.get(k);
      if (!pg || pg.missing || pg.invalid) missing.push(t);
    }
    await sleep(800);
  }
  return missing;
}

async function main() {
  const problems = [];
  const commonsFiles = new Set();
  const wikiTitles = new Set();
  const dvidsIds = new Set();
  const iaIds = new Set();
  for (const c of CASES) {
    if (c.wiki) wikiTitles.add(c.wiki);
    for (const m of c.media || []) {
      if (m.commons) commonsFiles.add(m.commons);
      if (m.dvids) dvidsIds.add(m.dvids);
      if (m.ia) iaIds.add(m.ia);
    }
    for (const id of c.bluebook || []) iaIds.add(id);
  }
  for (const g of GOV_FILES) for (const d of g.commons || []) commonsFiles.add(d.file);

  const official = JSON.parse(await readFile(path.join(ROOT, 'public/data/official-uap-media.json'), 'utf8'));
  const known = new Set(official.items.map((i) => i.dvidsId));
  for (const id of dvidsIds) if (!known.has(id)) problems.push(`DVIDS id not in catalogue: ${id}`);

  const bluebook = JSON.parse(await readFile(path.join(ROOT, 'public/data/bluebook.json'), 'utf8'));
  const bb = new Set(bluebook.records.map((r) => r[0]));
  for (const id of iaIds) if (!bb.has(id)) problems.push(`Blue Book identifier not found: ${id}`);

  console.log(`Checking ${commonsFiles.size} Commons files and ${wikiTitles.size} Wikipedia articles…`);
  for (const t of await missingTitles('commons.wikimedia.org', [...commonsFiles]))
    problems.push(`Commons file missing: ${t}`);
  for (const t of await missingTitles('en.wikipedia.org', [...wikiTitles]))
    problems.push(`Wikipedia article missing: ${t}`);

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`All ${commonsFiles.size + wikiTitles.size + dvidsIds.size + iaIds.size} references verified.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
