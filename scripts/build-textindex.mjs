#!/usr/bin/env node
/**
 * Build a word index over every journal page: the MUFON UFO Journal and the
 * research archives (APRO, NICAP, CUFOS, MUFON chapters). It reads the OCR
 * text cached by build-mufon.mjs and build-journals.mjs (run those first)
 * and writes public/data/textindex/: for each word, the pages it is on, in
 * one file per first letter so a search downloads only what it needs.
 * The text itself is not stored; results link to the pages.
 *
 *   node scripts/build-textindex.mjs
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, CACHE } from './lib/geonames.mjs';
import { words, shardOf, encodePostings } from '../src/services/textsearch.js';

const OUT = path.join(ROOT, 'public/data/textindex');
const MAX_PAGES = 1200; // words on more pages than this are too common to help

async function mufonPages(is) {
  const text = gunzipSync(await readFile(path.join(CACHE, 'mufon', `${is}_hocr_searchtext.txt.gz`))).toString('utf8');
  const index = JSON.parse(gunzipSync(await readFile(path.join(CACHE, 'mufon', `${is}_hocr_pageindex.json.gz`))));
  const cps = Array.from(text);
  return index.map(([a, b]) => cps.slice(a, b).join(''));
}

async function journalPages(id) {
  const file = path.join(CACHE, 'journals', `${id.replace(/[^\w.-]+/g, '_')}.pages.json.gz`);
  return existsSync(file) ? JSON.parse(gunzipSync(await readFile(file))) : null;
}

async function main() {
  const mufon = JSON.parse(await readFile(path.join(ROOT, 'public/data/mufon.json'), 'utf8'));
  const journals = JSON.parse(await readFile(path.join(ROOT, 'public/data/journals.json'), 'utf8'));
  // Page ids run through the MUFON issues, then the archive issues, page by page.
  const archives = [
    { key: 'mufon', issues: mufon.issues.map(([id, , , , , , pages]) => ({ id, pages })), read: mufonPages },
    { key: 'journals', issues: journals.issues.map(([id, , , , , , , , , , , pages]) => ({ id, pages })), read: journalPages },
  ];
  const postings = new Map();
  let pageId = 0;
  let missing = 0;
  for (const a of archives)
    for (const is of a.issues) {
      let pages = null;
      try {
        pages = await a.read(is.id);
      } catch {}
      if (!pages) missing++;
      for (let leaf = 0; leaf < is.pages; leaf++, pageId++)
        for (const w of words(pages?.[leaf] || '')) {
          let list = postings.get(w);
          if (!list) postings.set(w, (list = []));
          list.push(pageId);
        }
    }
  const shards = {};
  const common = [];
  let kept = 0;
  for (const [w, list] of [...postings].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length > MAX_PAGES) common.push(w);
    if (list.length < 3 || list.length > MAX_PAGES) continue; // OCR noise, or too common
    (shards[shardOf(w)] ||= {})[w] = encodePostings(list);
    kept++;
  }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  let bytes = 0;
  for (const [k, words] of Object.entries(shards)) {
    const json = JSON.stringify(words);
    bytes += json.length;
    await writeFile(path.join(OUT, `${k}.json`), json + '\n');
  }
  const meta = {
    generated: new Date().toISOString(),
    note: 'Word → pages index over the OCR text of the MUFON UFO Journal and the research archives, one file per first letter. Page ids count pages through mufon.json issues, then journals.json issues.',
    pages: pageId,
    archives: archives.map((a) => ({ key: a.key, issuePages: a.issues.map((is) => is.pages) })),
    minPages: 3,
    maxPages: MAX_PAGES,
    shards: Object.keys(shards).sort(),
    common, // on too many pages to index; the app says so rather than finding nothing
  };
  await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta) + '\n');
  console.log(`${pageId} pages (${missing} issues without cached text), ${postings.size} words, ${kept} indexed in ${meta.shards.length} shards, ${(bytes / 1e6).toFixed(2)} MB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
