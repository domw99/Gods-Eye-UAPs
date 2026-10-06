import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { addStrings, entry, fileText, languageCodes } from '../scripts/add-strings.mjs';
import { isMain } from '../scripts/lib/is-main.mjs';
import { siteUrl } from '../scripts/lib/site.mjs';
import { productionPackages, repoUrl } from '../scripts/build-notices.mjs';
import { byVersionDesc, noteBody, addedOn } from '../scripts/build-changelog.mjs';
import { RELEASE, SITE_URL } from '../src/config.js';

const CODES = languageCodes();
const blank = () => Object.fromEntries(CODES.map((c) => [c, { Hello: `hello-${c}` }]));
const all = (text) => Object.fromEntries(CODES.map((c) => [c, text(c)]));

describe('adding interface strings', () => {
  it('lists the languages in the order the app does', () => {
    expect(CODES).toEqual(['es', 'fr', 'de', 'pt', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'id', 'ja', 'ko', 'zh']);
  });

  it('writes the language files exactly as they are now', async () => {
    for (const c of CODES) {
      const file = path.resolve(`src/i18n/locales/${c}.js`);
      const text = readFileSync(file, 'utf8');
      const dict = (await import(pathToFileURL(file).href)).default;
      expect(fileText(text.split('\n')[0], dict), c).toBe(text);
    }
  }, 30_000); // it imports all fifteen dictionaries, which can take longer than the default 5 s on a busy machine

  it('adds a text to every language, by code or as a list', () => {
    const dicts = blank();
    const r = addStrings(dicts, { 'Share it': all((c) => `share-${c}`), 'Two {n}': CODES.map((c) => `two-${c} {n}`) }, CODES);
    expect(r).toEqual({ added: ['Share it', 'Two {n}'], skipped: [], problems: [] });
    for (const c of CODES) {
      expect(dicts[c]['Share it']).toBe(`share-${c}`);
      expect(dicts[c]['Two {n}']).toBe(`two-${c} {n}`);
    }
  });

  it('leaves what is there alone unless told to replace it', () => {
    const dicts = blank();
    expect(addStrings(dicts, { Hello: all(() => 'new') }, CODES)).toMatchObject({ added: [], skipped: ['Hello'] });
    expect(dicts.fr.Hello).toBe('hello-fr');
    expect(addStrings(dicts, { Hello: all(() => 'new') }, CODES, { replace: true }).added).toEqual(['Hello']);
    expect(dicts.fr.Hello).toBe('new');
  });

  it('writes nothing when a language is missing, a placeholder is lost or a plural has no "other"', () => {
    const dicts = blank();
    const missing = all((c) => `x-${c}`);
    delete missing.ja;
    expect(addStrings(dicts, { 'No ja': missing }, CODES).problems).toEqual(['"No ja": no ja translation']);
    expect(addStrings(dicts, { 'Count {n}': all(() => 'count') }, CODES).problems).toHaveLength(CODES.length);
    expect(addStrings(dicts, { '{n} a|{n} b': all(() => ({ one: '{n} a' })) }, CODES).problems[0]).toMatch(/needs an object with an "other" form/);
    expect(addStrings(dicts, { Short: ['one', 'two'] }, CODES).problems[0]).toMatch(/2 translations, expected 15/);
    for (const c of CODES) expect(Object.keys(dicts[c])).toEqual(['Hello']); // untouched
  });

  it('writes a plural table on one line', () => {
    expect(entry({ one: '{n} dossier', other: '{n} dossiers' })).toBe('{"one": "{n} dossier", "other": "{n} dossiers"}');
    expect(entry('plain "quoted"')).toBe('"plain \\"quoted\\""');
  });
});

describe('the notices and the changelog', () => {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

  it('leaves development tools out of the production list', () => {
    const names = productionPackages(lock).map((p) => p.name);
    expect(names).toContain('cesium');
    expect(names).toContain('satellite.js');
    expect(names).not.toContain('vitest');
    expect(names).not.toContain('@playwright/test');
  });

  it('names every production library in THIRD_PARTY_NOTICES.md (run `npm run build:notices` after changing dependencies)', () => {
    const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
    const missing = productionPackages(lock).filter((p) => !notices.includes(`| \`${p.name}\` |`));
    expect(missing.map((p) => p.name)).toEqual([]);
  });

  it('turns the ways package.json names a repository into links', () => {
    expect(repoUrl('git+https://github.com/a/b.git')).toBe('https://github.com/a/b');
    expect(repoUrl('git@github.com:mapbox/point-geometry.git')).toBe('https://github.com/mapbox/point-geometry');
    expect(repoUrl('ssh://git@github.com/mapbox/pbf.git')).toBe('https://github.com/mapbox/pbf');
    expect(repoUrl('git://github.com/a/b.git')).toBe('https://github.com/a/b');
    expect(repoUrl('a/b')).toBe('https://github.com/a/b');
    expect(repoUrl('')).toBe('');
  });

  const versions = readdirSync('.github/release-notes').map((f) => f.replace(/^v|\.md$/g, '')).sort(byVersionDesc);

  it('has release notes for the version the app announces, and it is the newest', () => {
    expect(versions[0]).toBe(RELEASE);
  });

  it('has a section in CHANGELOG.md for every release note, newest first (run `npm run build:changelog`)', () => {
    const headings = [...readFileSync('CHANGELOG.md', 'utf8').matchAll(/^## \[([\d.]+)\]/gm)].map((m) => m[1]);
    expect(headings).toEqual(versions);
  });

  it('dates a release note that is not committed yet as today, not "undated" for good', () => {
    // The release steps run build:changelog before committing the new note.
    expect(addedOn('v99.99.md', new Date(2031, 0, 5))).toBe('2031-01-05');
    expect(addedOn('v1.0.md')).toMatch(/^\d{4}-\d{2}-\d{2}$/); // committed: the date of its commit
  });

  it('orders versions as numbers and drops the lines meant only for the release page', () => {
    expect(['1.10', '1.2', '1.9', '2.0'].sort(byVersionDesc)).toEqual(['2.0', '1.10', '1.9', '1.2']);
    const body = noteBody('**Summary**\r\n\r\n### ▶ [Open the live app](https://x.test/)\r\n\r\nText\r\n\r\n\r\n<sub>made by [me](https://x.test)</sub>\r\n');
    expect(body).toBe('**Summary**\n\nText');
  });
});

describe('running a script', () => {
  it('knows a script was started even when its folder is reached through a symlink', () => {
    const real = path.resolve('scripts/lib/is-main.mjs');
    const dir = mkdtempSync(path.join(tmpdir(), 'uap-link-'));
    try {
      const link = path.join(dir, 'scripts');
      symlinkSync(path.resolve('scripts'), link, 'junction');
      const url = pathToFileURL(real).href; // node reports the real path for a module
      expect(isMain(url, real)).toBe(true);
      expect(isMain(url, path.join(link, 'lib/is-main.mjs'))).toBe(true);
      expect(isMain(url, path.resolve('scripts/add-strings.mjs'))).toBe(false);
      expect(isMain(url, undefined)).toBe(false);
      // The real thing: a script run through the link still runs (add-strings with no file prints its usage and exits 2).
      expect(spawnSync(process.execPath, [path.join(link, 'add-strings.mjs')], { encoding: 'utf8' })).toMatchObject({ status: 2, stderr: expect.stringContaining('Usage') });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the public address', () => {
  it('always ends in one slash, so page addresses built from it do not run together', () => {
    expect(siteUrl('https://example.org/sub')).toBe('https://example.org/sub/');
    expect(siteUrl('https://example.org/sub/')).toBe('https://example.org/sub/');
    expect(siteUrl(' https://example.org// ')).toBe('https://example.org/');
    expect(`${siteUrl('https://example.org/sub')}case/x/`).toBe('https://example.org/sub/case/x/');
  });

  it('is the default site when SITE_URL is unset or blank', () => {
    expect(siteUrl('')).toBe(SITE_URL);
    expect(siteUrl('  ')).toBe(SITE_URL);
    expect(siteUrl(undefined)).toBe(process.env.SITE_URL ? siteUrl(process.env.SITE_URL) : SITE_URL);
  });
});
