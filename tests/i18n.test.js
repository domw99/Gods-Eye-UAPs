import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The i18n module only touches the document to set <html lang/dir>; give it a stand-in.
globalThis.document = { documentElement: { dataset: {} }, body: null };
globalThis.localStorage = { setItem() {}, getItem: () => null };
const i18n = await import('../src/i18n/index.js');
const { LANGUAGES, setLanguage, t, th: _th, plural, fill, locale, pickLanguage, direction } = i18n;

const locales = {};
for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) locales[code] = (await import(`../src/i18n/locales/${code}.js`)).default;
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('interface languages', () => {
  it('has a dictionary for every listed language but English', () => {
    expect(Object.keys(locales).sort()).toEqual(LANGUAGES.map((l) => l.code).filter((c) => c !== 'en').sort());
    expect(readdirSync('src/i18n/locales').length).toBe(Object.keys(locales).length);
  });

  it('gives every language the same set of entries', () => {
    const base = Object.keys(locales.es).sort();
    expect(base.length).toBeGreaterThan(400);
    for (const [code, dict] of Object.entries(locales)) expect(Object.keys(dict).sort(), code).toEqual(base);
  });

  it('keeps the {placeholders} of each English text in its translations', () => {
    for (const [code, dict] of Object.entries(locales))
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value !== 'string') continue;
        expect(placeholders(value), `${code}: ${key}`).toEqual(placeholders(key));
        expect(value.trim(), `${code}: ${key}`).not.toBe('');
      }
  });

  it('writes plurals as a table with an "other" form', () => {
    for (const [code, dict] of Object.entries(locales))
      for (const [key, value] of Object.entries(dict))
        if (key.includes('|')) expect(value.other, `${code}: ${key}`).toBeTruthy();
  });

  it('has a translation for every text the code asks for by name', () => {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (!/i18n|data$/.test(path)) walk(path);
        } else if (path.endsWith('.js')) files.push(path);
      }
    };
    walk('src');
    const missing = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // t('…') / th('…') / toast('…') with a plain string, and plural(n, '…', '…')
      for (const m of text.matchAll(/\b(?:t|th|toast)\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
        const key = m[2].replace(/\\(['"])/g, '$1');
        if (!(key in locales.es)) missing.push(`${file}: ${key}`);
      }
      for (const m of text.matchAll(/\bplural\([^,]+,\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\\n])*)\3/g))
        if (!(`${m[2]}|${m[4]}` in locales.es)) missing.push(`${file}: ${m[2]}|${m[4]}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('t() and friends', () => {
  beforeAll(() => setLanguage('en', { save: false }));

  it('returns the English text, filled in, when the language is English', async () => {
    await setLanguage('en', { save: false });
    expect(t('Close')).toBe('Close');
    expect(t('{n} km away', { n: 12 })).toBe('12 km away');
    expect(locale()).toBe('en-GB'); // keeps day-month-year dates
  });

  it('translates, falls back to English for text it does not know, and fills placeholders', async () => {
    await setLanguage('de', { save: false });
    expect(t('Close')).toBe('Schließen');
    expect(t('{n} km away', { n: 12 })).toBe('12 km entfernt');
    expect(t('A sentence nobody translated {x}', { x: 1 })).toBe('A sentence nobody translated 1');
    expect(locale()).toBe('de');
  });

  it('uses each language’s own plural forms', async () => {
    await setLanguage('en', { save: false });
    expect(plural(1, 'page', 'pages')).toBe('page');
    expect(plural(3, 'page', 'pages')).toBe('pages');
    await setLanguage('ru', { save: false });
    expect([1, 2, 5].map((n) => plural(n, 'page', 'pages'))).toEqual(['страница', 'страницы', 'страниц']);
    await setLanguage('pl', { save: false });
    expect([1, 3, 12].map((n) => plural(n, 'page', 'pages'))).toEqual(['strona', 'strony', 'stron']);
    await setLanguage('ja', { save: false });
    expect(plural(5, 'page', 'pages')).toBe('ページ');
  });

  it('reads right to left for Arabic only', async () => {
    await setLanguage('ar', { save: false });
    expect(direction()).toBe('rtl');
    expect(document.documentElement.dataset.textDir).toBe('rtl');
    await setLanguage('fr', { save: false });
    expect(direction()).toBe('ltr');
  });

  it('starts English when asked for a language it does not have', async () => {
    expect(await setLanguage('xx', { save: false })).toBe('en');
  });

  it('picks the best supported language from the browser’s list', () => {
    expect(pickLanguage(['pt-BR', 'en'])).toBe('pt');
    expect(pickLanguage(['xx-YY', 'zh-Hans-CN'])).toBe('zh');
    expect(pickLanguage(['xx'])).toBe('en');
    expect(pickLanguage([])).toBe('en');
  });

  it('fill() leaves unknown placeholders alone', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});
