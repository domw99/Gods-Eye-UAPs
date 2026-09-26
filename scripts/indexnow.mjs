#!/usr/bin/env node
/**
 * Tell search engines (Bing, Yandex, Seznam, Naver and others that share
 * IndexNow; DuckDuckGo uses Bing's index) about every page in the live
 * sitemap, so new and changed case pages are crawled soon. The key is the
 * public/<key>.txt file, which the site serves to prove ownership.
 *
 *   node scripts/indexnow.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = process.env.SITE_URL || 'https://domw99.github.io/Gods-Eye-UAPs/';

async function main() {
  const file = (await readdir(path.join(ROOT, 'public'))).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
  if (!file) throw new Error('No IndexNow key file in public/');
  const key = (await readFile(path.join(ROOT, 'public', file), 'utf8')).trim();
  const xml = await (await fetch(`${SITE}sitemap.xml`)).text();
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!urlList.length) throw new Error(`No URLs in ${SITE}sitemap.xml`);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}${file}`, urlList }),
  });
  console.log(`IndexNow: ${urlList.length} URLs → ${res.status} ${res.statusText}`);
  // 200 and 202 are accepted; 422/403 mean the key or URLs were refused.
  if (!res.ok) {
    console.log(await res.text());
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
