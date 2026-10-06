#!/usr/bin/env node
/**
 * Add interface strings to every language file in one go.
 *
 *   node scripts/add-strings.mjs strings.json
 *
 * strings.json maps each English text (the key the code asks for) to its
 * translations, either by language code or as a list in the order of
 * LANGUAGES in src/i18n/index.js (es fr de pt it nl pl tr ru ar hi id ja ko zh):
 *
 *   {
 *     "Share this case": { "es": "Compartir este caso", "fr": "Partager ce cas", ... },
 *     "{n} case|{n} cases": { "fr": { "one": "{n} cas", "other": "{n} cas" }, ... }
 *   }
 *
 * A text already in the files is left alone (and reported) unless --replace is
 * given. Every language must have every new entry, with the {placeholders} of
 * the English text kept; a plural entry needs an "other" form. Nothing is
 * written unless all of that holds.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './lib/is-main.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCALES = path.join(ROOT, 'src/i18n/locales');

/** The language codes after English, in the order the app lists them. */
export function languageCodes(source = readFileSync(path.join(ROOT, 'src/i18n/index.js'), 'utf8')) {
  const block = source.slice(source.indexOf('export const LANGUAGES'), source.indexOf('];', source.indexOf('export const LANGUAGES')));
  return [...block.matchAll(/code:\s*'([a-z]{2})'/g)].map((m) => m[1]).filter((c) => c !== 'en');
}

/** One entry the way the language files write it: a string, or a plural table on one line. */
export function entry(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;
}

/** A language file's text from its header line and entries. */
export function fileText(header, dict) {
  return `${[header, 'export default {', ...Object.entries(dict).map(([k, v]) => `  ${JSON.stringify(k)}: ${entry(v)},`), '};'].join('\n')}\n`;
}

/** The {names} in a text, once each. */
const placeholders = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');

/**
 * Check `strings` and merge it into `dicts` (code → entries). Returns { added, skipped, problems };
 * the dictionaries are only changed when there are no problems.
 */
export function addStrings(dicts, strings, codes, { replace = false } = {}) {
  const problems = [];
  const added = [];
  const skipped = [];
  const next = Object.fromEntries(codes.map((c) => [c, { ...dicts[c] }]));
  for (const [key, given] of Object.entries(strings)) {
    const per = Array.isArray(given) ? Object.fromEntries(codes.map((c, i) => [c, given[i]])) : given;
    if (Array.isArray(given) && given.length !== codes.length) problems.push(`"${key}": ${given.length} translations, expected ${codes.length} (${codes.join(' ')})`);
    const exists = codes.every((c) => key in dicts[c]);
    if (exists && !replace) {
      skipped.push(key);
      continue;
    }
    const plural = key.includes('|');
    for (const c of codes) {
      const v = per[c];
      if (v === undefined || v === '') problems.push(`"${key}": no ${c} translation`);
      else if (plural && !(typeof v === 'object' && v.other)) problems.push(`"${key}" (${c}): a plural entry needs an object with an "other" form`);
      else if (!plural && typeof v !== 'string') problems.push(`"${key}" (${c}): expected text`);
      else {
        const want = placeholders(key);
        for (const f of plural ? Object.values(v) : [v]) if (placeholders(f) !== want) problems.push(`"${key}" (${c}): placeholders {${placeholders(f)}} differ from the English {${want}}`);
        next[c][key] = v;
      }
    }
    added.push(key);
  }
  if (!problems.length) for (const c of codes) dicts[c] = next[c];
  return { added, skipped, problems };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node scripts/add-strings.mjs strings.json [--replace]');
    process.exit(2);
  }
  const strings = JSON.parse(readFileSync(file, 'utf8'));
  const codes = languageCodes();
  const dicts = {};
  const headers = {};
  for (const c of codes) {
    const p = path.join(LOCALES, `${c}.js`);
    dicts[c] = (await import(pathToFileURL(p).href)).default;
    headers[c] = readFileSync(p, 'utf8').split('\n')[0];
  }
  const { added, skipped, problems } = addStrings(dicts, strings, codes, { replace: args.includes('--replace') });
  if (problems.length) {
    console.error(`Nothing written. ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  for (const c of codes) writeFileSync(path.join(LOCALES, `${c}.js`), fileText(headers[c], dicts[c]));
  console.log(`Added ${added.length} text(s) to ${codes.length} languages.${skipped.length ? ` Already present, left alone: ${skipped.length}.` : ''}`);
  console.log(`Files in ${path.relative(ROOT, LOCALES)}: ${readdirSync(LOCALES).length}`);
}

if (isMain(import.meta.url)) await main();
