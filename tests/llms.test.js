import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { robotsTxt, llmsTxt, llmsFullTxt } from '../scripts/lib/llms.mjs';
import { caseIndex } from '../scripts/lib/case-pages.mjs';
import { openData } from '../scripts/lib/open-data.mjs';
import { CASES } from '../src/data/cases/index.js';

const SITE = 'https://example.github.io/app/';
const countries = new Set(CASES.map((c) => c.cc).filter((c) => c && c !== 'XX')).size;

describe('robots.txt', () => {
  it('allows everything and points to the sitemap', () => {
    const txt = robotsTxt(SITE);
    expect(txt).toMatch(/^User-agent: \*$/m);
    expect(txt).toMatch(/^Allow: \/$/m);
    expect(txt).toContain(`Sitemap: ${SITE}sitemap.xml`);
    expect(txt).not.toMatch(/^Disallow:/m);
  });
});

describe('llms.txt', () => {
  const txt = llmsTxt(CASES, { site: SITE });

  it('follows the llms.txt layout: a title, a summary, then sections of links', () => {
    expect(txt.startsWith("# God's Eye // UAP\n\n> ")).toBe(true);
    expect(txt).toMatch(/^## Pages$/m);
    expect(txt).toMatch(/^## Data$/m);
    for (const [, url] of txt.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)) expect(url).toMatch(/^https:\/\//);
  });

  it('says how many cases and countries there are, and links the data', () => {
    expect(txt).toContain(`${CASES.length} well-documented`);
    expect(txt).toContain(`${countries} countries and territories`);
    for (const f of ['cases.json', 'cases.csv', 'cases.geojson', 'llms-full.txt']) expect(txt).toContain(f);
  });

  it('tells a reader how to treat the status', () => {
    expect(txt).toMatch(/give its status and explanation/);
  });
});

describe('llms-full.txt', () => {
  const txt = llmsFullTxt(CASES, { site: SITE });

  it('has one section per case, oldest first, each with its status', () => {
    const headings = [...txt.matchAll(/^## (.+) \((-?\d+)\)$/gm)];
    expect(headings).toHaveLength(CASES.length);
    const years = headings.map((h) => Number(h[2]));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(txt.match(/^- Status: /gm)).toHaveLength(CASES.length);
  });

  it('names the country once: not again when the place already ends with it', () => {
    expect(txt).not.toMatch(/\(Germany\) \(Germany\)/);
    for (const [, place] of txt.matchAll(/^- Place: (.+)$/gm)) {
      const parens = place.match(/\(([^)]+)\)\s*$/);
      if (parens) expect(place.replace(/\s*\([^)]+\)\s*$/, ''), place).not.toContain(parens[1]);
    }
  });
});

describe('the number of countries', () => {
  it('is the same on the case index, the open-data page and the README, and does not count "several" (XX)', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain(`${countries} countries and territories`);
    expect(caseIndex(CASES, { site: SITE })).toContain(`${countries} countries and territories`);
    expect(openData(CASES, { site: SITE, version: '1', date: '2026-01-01' }).page).toContain(`${countries} countries and territories`);
  });
});
