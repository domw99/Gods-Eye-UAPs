import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The i18n module only touches the document to set <html lang/dir>; give it a stand-in.
globalThis.document = { documentElement: { dataset: {} }, body: null };
globalThis.localStorage = { setItem() {}, getItem: () => null };
const i18n = await import('../src/i18n/index.js');
const { LANGUAGES, setLanguage, t, th: _th, plural, fill, locale, pickLanguage, direction, upper } = i18n;

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
      // t('…') / th('…') / toast('…') / aboutLine('…') with a plain string, aboutName(colour, '…'), and plural(n, '…', '…')
      for (const m of text.matchAll(/\b(?:t|th|toast|aboutLine)\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
        const key = m[2].replace(/\\(['"])/g, '$1');
        if (!(key in locales.es)) missing.push(`${file}: ${key}`);
      }
      for (const m of text.matchAll(/\baboutName\(\s*'#[0-9a-f]{6}',\s*'([^']+)'/g))
        if (!(m[1] in locales.es)) missing.push(`${file}: ${m[1]}`);
      for (const m of text.matchAll(/\bplural\([^,]+,\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\\n])*)\3/g))
        if (!(`${m[2]}|${m[4]}` in locales.es)) missing.push(`${file}: ${m[2]}|${m[4]}`);
    }
    expect(missing).toEqual([]);
  });
});

/** Every string of an entry: the value, or each form of a plural table. */
const forms = (value) => (typeof value === 'string' ? [[null, value]] : Object.entries(value));
const eachText = (fn) => {
  for (const [code, dict] of Object.entries(locales))
    for (const [key, value] of Object.entries(dict)) for (const [form, text] of forms(value)) fn({ code, key, form, text, where: `${code}: ${key}${form ? ` [${form}]` : ''}` });
};
const bare = (s) => String(s).replace(/<[^>]+>|\{\w+\}/g, '');
const chars = (...codes) => codes.map((c) => String.fromCharCode(c)).join('');
const range = (from, to) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
const SCRIPTS = {
  cyrillic: range(0x400, 0x4ff),
  arabic: range(0x600, 0x6ff),
  devanagari: range(0x900, 0x97f),
  hangul: range(0xac00, 0xd7af),
  kana: range(0x3040, 0x30ff),
  han: range(0x4e00, 0x9fff),
};
const OWN_SCRIPT = { ru: ['cyrillic'], ar: ['arabic'], hi: ['devanagari'], ko: ['hangul'], ja: ['kana', 'han'], zh: ['han'] };

describe('dictionary quality', () => {
  it('keeps the {placeholders} of the English text in every form of a plural table', () => {
    eachText(({ key, form, text, where }) => {
      if (form) expect(placeholders(text), where).toEqual(placeholders(key.split('|')[1]));
    });
  });

  it('gives a plural table the forms its language uses for whole numbers, and no others', () => {
    const CLDR = ['zero', 'one', 'two', 'few', 'many', 'other'];
    for (const [code, dict] of Object.entries(locales)) {
      const rules = new Intl.PluralRules({ pt: 'pt-BR', zh: 'zh-CN' }[code] || code);
      // "other" is always written and "one" may match it (Turkish); few / many / two / zero (ru, pl, ar) must be written out
      const needed = new Set(Array.from({ length: 201 }, (_, n) => rules.select(n)));
      needed.delete('one');
      for (const [key, value] of Object.entries(dict)) {
        if (!key.includes('|')) continue;
        for (const f of Object.keys(value)) expect(CLDR, `${code}: ${key} has a form named "${f}"`).toContain(f);
        for (const f of needed) expect(value, `${code}: ${key} lacks "${f}"`).toHaveProperty(f);
      }
    }
  });

  it('keeps the HTML tags of the English text, in order, and nothing that would break the markup', () => {
    const tags = (s) => [...String(s).matchAll(/<\/?[a-z][^>]*>/gi)].map((m) => m[0]);
    eachText(({ key, form, text, where }) => {
      if (form) return;
      expect(tags(text), where).toEqual(tags(key));
      expect(/<(?![/a-z])/i.test(text), `${where}: a bare <`).toBe(false);
    });
  });

  it('has no mojibake, replacement characters, or invisible control and direction characters', () => {
    const mojibake = new RegExp(`${chars(0xfffd)}|[${chars(0xc2, 0xc3)}][${range(0x80, 0xbf)}]|${chars(0xe2, 0x20ac)}`);
    const invisible = new RegExp(`[${range(0, 8)}${range(0xb, 0xc)}${range(0xe, 0x1f)}${range(0x7f, 0x9f)}${range(0x200b, 0x200f)}${range(0x202a, 0x202e)}${range(0x2060, 0x2064)}${chars(0xfeff)}]`);
    eachText(({ code, text, where }) => {
      // One right-to-left mark at the start of an Arabic text is deliberate (see the next test).
      const body = code === 'ar' && text.startsWith(chars(0x200f)) ? text.slice(1) : text;
      expect(mojibake.test(body), `${where}: mojibake`).toBe(false);
      expect(invisible.test(body), `${where}: invisible character`).toBe(false);
    });
  });

  it('starts an Arabic text with a right-to-left mark when its first letter is Latin', () => {
    // The detail panels lay each block out from its first strong letter (plaintext bidi), so an Arabic sentence that opens with
    // GEIPAN or Kp would otherwise run left to right.
    const rlm = chars(0x200f);
    const latin = /[A-Za-z]/;
    const arabic = new RegExp(`[${range(0x600, 0x6ff)}]`);
    const bad = [];
    eachText(({ code, key, text, where }) => {
      if (code !== 'ar') return;
      const plain = text.replace(rlm, '').replace(/<[^>]*>/g, '').replace(/\{\w+\}/g, '');
      const first = [...plain].find((c) => latin.test(c) || arabic.test(c));
      const opensLatin = first && latin.test(first) && arabic.test(plain);
      if ((opensLatin || key.startsWith('{name}')) && !text.startsWith(rlm)) bad.push(where);
    });
    expect(bad).toEqual([]);
  });

  it('writes each language in its own script', () => {
    eachText(({ code, text, where }) => {
      for (const [name, span] of Object.entries(SCRIPTS))
        if (!(OWN_SCRIPT[code] || []).includes(name)) expect(new RegExp(`[${span}]`).test(text), `${where}: ${name} letters`).toBe(false);
    });
  });

  it('does not leave a sentence of English in a language that is not written in Latin letters', () => {
    // Names, codes and units may stay Latin; a text of three or more English words must have a translation in the language's script.
    const left = [];
    for (const [code, names] of Object.entries(OWN_SCRIPT)) {
      const own = new RegExp(`[${names.map((n) => SCRIPTS[n]).join('')}]`);
      for (const [key, value] of Object.entries(locales[code])) {
        if (key.includes('|')) continue;
        const words = bare(key).match(/[A-Za-z]{3,}/g) || [];
        if (words.length >= 3 && !own.test(value)) left.push(`${code}: ${key}`);
      }
    }
    expect(left).toEqual([]);
  });

  it('translates a label that is in capitals into capitals, where the script has capitals', () => {
    const bad = [];
    for (const code of ['es', 'fr', 'de', 'pt', 'it', 'nl', 'pl', 'tr', 'ru', 'id'])
      for (const [key, value] of Object.entries(locales[code])) {
        const letters = bare(key).replace(/[^A-Za-z]/g, '');
        if (key.includes('|') || letters.length < 3 || letters !== letters.toUpperCase()) continue;
        if (bare(value) !== bare(value).toLocaleUpperCase(code)) bad.push(`${code}: ${key} → ${value}`);
      }
    expect(bad).toEqual([]);
  });

  it('keeps the closing … ? ! : of a label, and the (K) key hint of a button', () => {
    const FINAL = { '…': /(…|\.\.\.)$/, '?': /[?？؟]$/, '!': /[!！]$/, ':': /[:：]$/ };
    const trim = (s) => s.trim().replace(/[)\]）」»”"’]+$/, '');
    const bad = [];
    for (const [code, dict] of Object.entries(locales))
      for (const [key, value] of Object.entries(dict)) {
        if (key.includes('|')) continue;
        const end = trim(key).slice(-1);
        if (FINAL[end] && !FINAL[end].test(trim(value))) bad.push(`${code}: ${key} → ${value}`);
        const hint = key.match(/ \(([A-Za-z0-9?+−])\)$/); // a one-key hint; (Esc) and (Space) are named on the language's own keyboards
        if (hint && !value.includes(`(${hint[1]})`) && !value.includes(`（${hint[1]}）`)) bad.push(`${code}: ${key} → ${value} (key hint)`);
      }
    expect(bad).toEqual([]);
  });

  it('keeps no text the code can no longer ask for (an old release toast, a replaced label)', () => {
    const files = [join('index.html')];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== 'locales') walk(path);
        } else if (/\.(js|mjs|html)$/.test(name)) files.push(path);
      }
    };
    walk('src');
    walk('scripts');
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const lower = source.toLowerCase().replace(/\s+/g, ' ');
    // Cesium writes its own attribution box, and one caption is built around two empty interpolations (src/ui/skychart.js).
    const built = new Set(['Data attribution', 'Data provided by:', 'Close data attribution', 'Chart: looking straight up, north at the top, east on the left; WHERE is compass direction and height above the horizon. Computed for the recorded time and place; old reports can be off by minutes or hours.']);
    const stale = Object.keys(locales.es).filter((key) => {
      if (built.has(key)) return false;
      // a text may be written in another case in the code and upper-cased when it is shown
      return !key.split('|').some((part) => [part, part.replace(/'/g, "\\'"), part.replace(/&/g, '&amp;'), part.replace(/’/g, '&rsquo;')].some((v) => source.includes(v) || lower.includes(v.toLowerCase().replace(/\s+/g, ' '))));
    });
    expect(stale).toEqual([]);
  });

  it('has no two entries whose English text differs only by spacing or quote style', () => {
    const seen = new Map();
    const clash = [];
    for (const key of Object.keys(locales.es)) {
      const norm = key.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
      if (seen.has(norm)) clash.push(`${JSON.stringify(seen.get(norm))} / ${JSON.stringify(key)}`);
      seen.set(norm, key);
    }
    expect(clash).toEqual([]);
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

  it('never mistakes an inherited object property for a translation', async () => {
    // A text node or a title that happens to read "constructor" is not a dictionary key.
    await setLanguage('de', { save: false });
    for (const word of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) expect(t(word), word).toBe(word);
    expect(plural(2, 'constructor', 'toString')).toBe('toString');
  });

  it('upper-cases translated labels by the language’s own rules', async () => {
    await setLanguage('tr', { save: false });
    expect(upper('otomatik (vaka zamanı)')).toBe('OTOMATİK (VAKA ZAMANI)'); // toUpperCase() would give OTOMATIK
    await setLanguage('de', { save: false });
    expect(upper('Straßen')).toBe('STRASSEN');
    await setLanguage('en', { save: false });
    expect(upper('topographic')).toBe('TOPOGRAPHIC');
  });

  it('fill() leaves unknown placeholders alone', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});

describe('label tables', () => {
  // The data modules hold English labels that the interface shows through t() or the DOM pass:
  // a label added without its dictionary entry would stay English in every language.
  const wanted = async () => {
    const tax = await import('../src/data/taxonomy.js');
    const air = await import('../src/services/airspace.js');
    const fields = await import('../src/services/airfields.js');
    const geipan = await import('../src/services/geipan.js');
    const keys = new Map();
    const need = (text, where) => text && keys.set(text, where);
    for (const [k, v] of Object.entries(tax.EVIDENCE)) {
      need(v.label, `EVIDENCE.${k}.label`);
      need(v.long, `EVIDENCE.${k}.long`);
    }
    for (const [k, v] of Object.entries(tax.STATUS)) {
      need(v.label, `STATUS.${k}.label`);
      need(v.long, `STATUS.${k}.long`);
    }
    for (const [k, v] of Object.entries(tax.SHAPES)) need(v.label, `SHAPES.${k}`);
    for (const [k, v] of Object.entries(tax.PRECISION)) need(v, `PRECISION.${k}`);
    for (const [k, v] of Object.entries(tax.TRACK_BASIS)) need(v.toUpperCase(), `TRACK_BASIS.${k} (shown in capitals)`);
    for (const [k, v] of Object.entries(air.AIRSPACE_TYPES)) need(v.label, `AIRSPACE_TYPES.${k}`);
    for (const size of fields.SIZES) need(size, 'airfield size');
    for (const [k, v] of Object.entries(geipan.GEIPAN_CLASSES)) {
      need(v.label, `GEIPAN_CLASSES.${k}.label`);
      need(v.long, `GEIPAN_CLASSES.${k}.long`);
    }
    return keys;
  };

  it('has an entry for every label the data modules define', async () => {
    const all = await wanted();
    expect(all.size).toBeGreaterThan(60); // the tables were found, not silently empty
    const missing = [...all].filter(([text]) => !(text in locales.es)).map(([text, where]) => `${where}: ${text}`);
    expect(missing).toEqual([]);
  });
});
