/**
 * Interface languages. English is the source text and the key: t('Search')
 * returns the translation when the current language has one and the English
 * otherwise, so a missing translation is never a blank or a raw key.
 *
 *   t('Near {place}', { place })      text built in code
 *   translateDom(el)                  text already in the DOM (index.html, and
 *                                     every panel rendered through mount())
 *
 * The DOM pass replaces a text node, or a title / aria-label / placeholder /
 * alt attribute, whose whole text is a key. Anything that isn't a key (case
 * titles, summaries, quotes from the archives) is left as it is, so the case
 * files themselves stay in English. Dictionaries are src/i18n/locales/<code>.js
 * and load on demand.
 */

/** code, the name in its own language, and its reading direction. */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文（简体）' },
];

const KEY = 'gods-eye-uap:lang';
const loaders = import.meta.glob('./locales/*.js'); // './locales/es.js' → () => import(...)
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'SVG', 'CANVAS']);
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'data-caption'];

let lang = 'en';
let translated = false; // has anything been translated yet (so English can be restored)
let dict = {};
const originals = new WeakMap(); // Text node → { src: English, out: what we wrote }; Element → { attr: { src, out } }
const listeners = new Set();

export const language = () => lang;
export const direction = () => LANGUAGES.find((l) => l.code === lang)?.dir || 'ltr';
/** The locale to hand to Intl, for dates and numbers. */
export const locale = () => ({ en: 'en-GB', pt: 'pt-BR', zh: 'zh-CN' })[lang] || lang;

/** Fill in {name} placeholders. */
export function fill(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)) : text;
}

/** The translation of `key` (English text, optionally with {placeholders}), or the key itself. */
export function t(key, vars) {
  return fill(dict[key] ?? key, vars);
}

/**
 * Like t() for a count: `plural(n, '{n} page', '{n} pages')` picks the English
 * form; another language lists its forms by CLDR category ({ one, few, many,
 * other }) under the 'one|many' key, and the right one is chosen for n.
 */
export function plural(n, one, many, vars = {}) {
  const forms = dict[`${one}|${many}`];
  if (forms && typeof forms === 'object') {
    const text = forms[new Intl.PluralRules(locale()).select(n)] ?? forms.other;
    if (text !== undefined) return fill(text, { n, ...vars });
  }
  return fill(n === 1 ? one : many, { n, ...vars });
}

// What we last wrote, so text the app changes afterwards (a title that follows
// a toggle, a count) is read as new English rather than overwritten by an old one.
function translateText(node) {
  const saved = originals.get(node);
  const src = saved && node.nodeValue === saved.out ? saved.src : node.nodeValue;
  const key = src.trim();
  if (!key) return;
  if (globalThis.__i18nSeen) globalThis.__i18nSeen.add(key);
  const tr = lang === 'en' ? undefined : dict[key];
  if (tr === undefined) {
    if (saved && node.nodeValue === saved.out) node.nodeValue = src; // back to English
    originals.delete(node);
    return;
  }
  const lead = src.slice(0, src.length - src.trimStart().length);
  const trail = src.slice(src.trimEnd().length);
  const out = lead + tr + trail;
  node.nodeValue = out;
  translated = true;
  originals.set(node, { src, out });
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const saved = originals.get(el) || {};
    const cur = el.getAttribute(a);
    const src = saved[a] && cur === saved[a].out ? saved[a].src : cur;
    if (globalThis.__i18nSeen && src.trim()) globalThis.__i18nSeen.add(`[${a}] ${src.trim()}`);
    const tr = lang === 'en' ? undefined : dict[src.trim()];
    if (tr === undefined) {
      if (saved[a] && cur === saved[a].out) el.setAttribute(a, src);
      if (saved[a]) delete saved[a];
      continue;
    }
    el.setAttribute(a, tr);
    translated = true;
    originals.set(el, { ...saved, [a]: { src, out: tr } });
  }
}

/** Translate the text and labels under `root` (an element, or the document body). */
export function translateDom(root = document.body) {
  if (!root || (lang === 'en' && !translated && !globalThis.__i18nSeen)) return; // nothing to do in a fresh English page
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType !== 1 || !SKIP_TAGS.has(n.tagName.toUpperCase())) return NodeFilter.FILTER_ACCEPT;
      translateAttrs(n); // a textarea's placeholder still translates; what is inside it does not
      return NodeFilter.FILTER_REJECT;
    },
  });
  if (root.nodeType === 1) translateAttrs(root);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) translateText(n);
    else translateAttrs(n);
  }
}

/** Call `fn(code)` after the language changes (to redraw anything built in code). */
export const onLanguageChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** The best supported language for a list of browser language tags. */
export function pickLanguage(tags) {
  for (const tag of tags || []) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGUAGES.some((l) => l.code === base)) return base;
  }
  return 'en';
}

export async function setLanguage(code, { save = true } = {}) {
  if (!LANGUAGES.some((l) => l.code === code)) code = 'en';
  if (code === 'en') dict = {};
  else {
    const load = loaders[`./locales/${code}.js`];
    try {
      dict = load ? (await load()).default : {};
    } catch (e) {
      console.warn('[i18n] could not load', code, e);
      dict = {};
      code = 'en';
    }
  }
  lang = code;
  const root = document.documentElement;
  root.lang = code;
  root.dir = 'ltr'; // the layout keeps its sides; text inside panels reads right to left (see the CSS)
  root.dataset.textDir = direction();
  if (save) {
    try {
      localStorage.setItem(KEY, code);
    } catch {}
  }
  translateDom(document.body);
  for (const fn of listeners) fn(code);
  return code;
}

/** Start in the saved language, else the browser's. */
export async function initLanguage() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {}
  const code = saved && LANGUAGES.some((l) => l.code === saved) ? saved : pickLanguage(globalThis.navigator?.languages?.length ? navigator.languages : [navigator.language]);
  return setLanguage(code, { save: false });
}
