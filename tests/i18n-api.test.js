import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 }); // a language's dictionary is loaded the first time it is chosen, which is slow on a busy machine

// A small stand-in for the DOM: just enough tree, attributes and TreeWalker for translateDom().
const text = (s) => ({ nodeType: 3, nodeValue: s, childNodes: [] });
const el = (tagName, attrs = {}, ...childNodes) => ({
  nodeType: 1,
  tagName,
  attrs: { ...attrs },
  childNodes,
  hasAttribute(n) {
    return n in this.attrs;
  },
  getAttribute(n) {
    return this.attrs[n];
  },
  setAttribute(n, v) {
    this.attrs[n] = v;
  },
});
globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
const stored = [];
globalThis.document = {
  documentElement: { dataset: {} },
  body: null,
  createTreeWalker(root, show, filter) {
    const order = [];
    const visit = (node) => {
      for (const child of node.childNodes) {
        const shown = (child.nodeType === 1 && show & 1) || (child.nodeType === 3 && show & 4);
        const verdict = shown ? filter.acceptNode(child) : 3;
        if (verdict === 1) order.push(child);
        if (verdict !== 2) visit(child);
      }
    };
    visit(root);
    let i = 0;
    return { nextNode: () => order[i++] ?? null };
  },
};
globalThis.localStorage = { getItem: () => null, setItem: (k, v) => stored.push([k, v]) };
const { setLanguage, onLanguageChange, language, t, plural, fill, pickLanguage, translateDom } = await import('../src/i18n/index.js');

beforeEach(async () => {
  await setLanguage('en', { save: false });
  stored.length = 0;
});

describe('choosing a language', () => {
  it('lets the newest choice win when an earlier dictionary arrives late', async () => {
    const seen = [];
    const off = onLanguageChange((code) => seen.push(code));
    const slow = setLanguage('de'); // has to load its dictionary first
    const fast = setLanguage('en'); // English needs no load, and was asked for last
    await Promise.all([slow, fast]);
    expect(language()).toBe('en');
    expect(t('Close')).toBe('Close');
    expect(seen).toEqual(['en']);
    expect(stored).toEqual([['gods-eye-uap:lang', 'en']]); // the abandoned choice was not saved as the preference
    off();
  });

  it('ends on the last of several quick choices, as when arrowing through the language list', async () => {
    await Promise.all(['es', 'fr', 'de', 'it'].map((code) => setLanguage(code, { save: false })));
    expect(language()).toBe('it');
    expect(document.documentElement.lang).toBe('it');
    expect(t('Close')).toBe('Chiudi');
  });

  it('reads language tags written with an underscore too', () => {
    expect(pickLanguage(['es_MX'])).toBe('es');
    expect(pickLanguage(['xx_YY', 'pt_BR'])).toBe('pt');
  });
});

describe('looking texts up', () => {
  it('never finds Object.prototype members in the dictionary', async () => {
    await setLanguage('de', { save: false });
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) expect(t(key)).toBe(key);
    expect(plural(2, 'constructor', 'toString')).toBe('toString');
    expect(t('Close')).toBe('Schließen');
  });

  it('leaves a text that reads "constructor" alone when translating the page', async () => {
    await setLanguage('de', { save: false });
    const note = text('constructor');
    const tip = el('BUTTON', { title: 'toString', 'aria-label': 'Close' }, text('Close'));
    const body = el('BODY', {}, note, tip);
    translateDom(body);
    expect(note.nodeValue).toBe('constructor');
    expect(tip.attrs.title).toBe('toString');
    expect(tip.attrs['aria-label']).toBe('Schließen');
    expect(tip.childNodes[0].nodeValue).toBe('Schließen');
    // Back to English restores the original words, and translating twice does not stack.
    translateDom(body);
    expect(tip.childNodes[0].nodeValue).toBe('Schließen');
    await setLanguage('en', { save: false });
    translateDom(body);
    expect(tip.childNodes[0].nodeValue).toBe('Close');
    expect(tip.attrs['aria-label']).toBe('Close');
  });
});

describe('placeholders', () => {
  it('copies values containing $ patterns literally, and fills a repeated placeholder everywhere', () => {
    expect(fill('{a} then {a}, not {b}', { a: '$& $1 $`', b: undefined })).toBe('$& $1 $` then $& $1 $`, not {b}');
    expect(t('{n} km away', { n: "$'" })).toBe("$' km away");
  });
});
