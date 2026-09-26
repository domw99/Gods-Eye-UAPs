#!/usr/bin/env node
/**
 * Check every outside link the case files and the files library cite
 * (Commons files, Wikipedia titles, DVIDS and Blue Book ids are checked by
 * verify-media.mjs). Writes link-report.md and exits non-zero when a link is
 * broken. Sites that refuse robots (403/429) are listed as unverifiable,
 * not broken.
 *
 *   node scripts/check-links.mjs
 */
import { writeFile } from 'node:fs/promises';
import { CASES } from '../src/data/cases/index.js';
import { GOV_FILES } from '../src/data/govFiles.js';

const UA = 'Mozilla/5.0 (compatible; GodsEyeUAP-linkcheck/1.0; +https://github.com/domw99/Gods-Eye-UAPs)';
const TIMEOUT = 25_000;

/** Every cited URL with where it is cited. */
export function collectLinks(cases = CASES, files = GOV_FILES) {
  const seen = new Map();
  const add = (url, where) => {
    if (!/^https?:\/\//.test(url)) return;
    if (!seen.has(url)) seen.set(url, []);
    seen.get(url).push(where);
  };
  for (const c of cases) for (const s of c.sources || []) add(s.url, `case ${c.id}`);
  for (const f of files) for (const l of f.links || []) add(l.url, `files: ${f.title}`);
  return [...seen].map(([url, where]) => ({ url, where }));
}

/** ok | blocked (the site refuses robots) | broken */
export function classify(status) {
  if (status >= 200 && status < 400) return 'ok';
  if ([401, 403, 405, 406, 429, 451, 999].includes(status)) return 'blocked';
  return 'broken';
}

async function probe(url) {
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,*/*' } });
      res.body?.cancel?.();
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  };
  let last = 'error';
  for (let i = 0; i < 2; i++) {
    try {
      let status = await attempt('HEAD');
      if (status === 405 || status === 403 || status === 404) status = await attempt('GET'); // some servers mishandle HEAD
      if (classify(status) !== 'broken' || i === 1) return status;
      last = status;
    } catch (e) {
      last = e.name === 'AbortError' ? 'timeout' : e.cause?.code || e.message;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return last;
}

async function main() {
  const links = collectLinks();
  console.log(`Checking ${links.length} links…`);
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < links.length) {
        const l = links[next++];
        const status = await probe(l.url);
        const kind = typeof status === 'number' ? classify(status) : 'broken';
        results.push({ ...l, status, kind });
        if (kind !== 'ok') console.log(`${kind.toUpperCase()} ${status} ${l.url}`);
      }
    }),
  );
  const broken = results.filter((r) => r.kind === 'broken');
  const blocked = results.filter((r) => r.kind === 'blocked');
  const row = (r) => `| ${r.status} | ${r.url} | ${r.where.join('; ')} |`;
  const report = [
    `# Link check`,
    '',
    `${results.length} links: ${results.length - broken.length - blocked.length} fine, ${broken.length} broken, ${blocked.length} unverifiable (the site refuses automated requests).`,
    '',
    ...(broken.length ? ['## Broken', '', '| Status | Link | Cited in |', '|---|---|---|', ...broken.map(row), ''] : []),
    ...(blocked.length ? ['## Unverifiable', '', '| Status | Link | Cited in |', '|---|---|---|', ...blocked.map(row), ''] : []),
  ].join('\n');
  await writeFile('link-report.md', report + '\n');
  console.log(`\n${results.length} checked · ${broken.length} broken · ${blocked.length} unverifiable`);
  process.exit(broken.length ? 1 : 0);
}

if (process.argv[1]?.endsWith('check-links.mjs'))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
