import { describe, it, expect } from 'vitest';
import { casePage, sitemap, caseDate, clip, esc } from '../scripts/lib/case-pages.mjs';
import { shareableUrl } from '../src/app/links.js';
import { CASES } from '../src/data/cases/index.js';

const SITE = 'https://example.github.io/app/';

describe('case pages', () => {
  it('writes the case date as recorded, without a time-zone shift', () => {
    expect(caseDate('1561-04-14T05:00:00+01:00')).toBe('14 April 1561');
    expect(caseDate('2004-11-14T14:00:00-08:00')).toBe('14 November 2004');
    expect(caseDate('')).toBe('');
  });

  it('clips at a word boundary', () => {
    expect(clip('one two three four', 100)).toBe('one two three four');
    const c = clip('alpha beta gamma delta epsilon', 16);
    expect(c.length).toBeLessThanOrEqual(16);
    expect(c).toBe('alpha beta…');
  });

  it('escapes HTML', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('gives every case a page with its own preview and a way on to the globe', () => {
    for (const c of CASES) {
      const page = casePage(c, { site: SITE, card: true });
      expect(page).toContain(`<meta property="og:url" content="${SITE}case/${c.id}/">`);
      expect(page).toContain(`<meta property="og:image" content="${SITE}cards/${c.id}.jpg">`);
      expect(page).toContain(`location.replace("../../#/case/${c.id}")`);
      expect(page).toContain('made by <a href="https://github.com/domw99">domw99</a>');
      expect(page).not.toMatch(/undefined|\[object Object\]/);
    }
  });

  it('falls back to the site image when a case has no card yet', () => {
    const page = casePage(CASES[0], { site: SITE, card: false });
    expect(page).toContain(`content="${SITE}og.jpg"`);
    expect(page).not.toContain('<img');
  });

  it('lists the app and every case in the sitemap', () => {
    const xml = sitemap(SITE, ['a', 'b'], '2026-01-02');
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml).toContain(`<loc>${SITE}case/b/</loc><lastmod>2026-01-02</lastmod>`);
  });
});

describe('share links', () => {
  it('shares a case through its page', () => {
    expect(shareableUrl('https://x.github.io/app/#/case/nimitz-2004', '/app/')).toBe('https://x.github.io/app/case/nimitz-2004/');
  });
  it('leaves other views, camera views and the dev server alone', () => {
    for (const href of ['https://x.github.io/app/#/bluebook/123', 'https://x.github.io/app/#/case/nimitz-2004/cam/1,2', 'https://x.github.io/app/'])
      expect(shareableUrl(href, '/app/')).toBe(href);
    expect(shareableUrl('http://localhost:5173/#/case/a', null)).toBe('http://localhost:5173/#/case/a');
  });
});
