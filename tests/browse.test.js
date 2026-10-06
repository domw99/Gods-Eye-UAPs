import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { browseGroups, browseIndex, groupPage, groupPath, groupsOf, countryName, statusMix, CATEGORY_PLURAL, EVIDENCE_PHRASE, SHAPE_PHRASE, KINDS, MIN_CASES } from '../scripts/lib/browse-pages.mjs';
import { casePage, caseIndex, sitemap } from '../scripts/lib/case-pages.mjs';
import { pageShell } from '../scripts/lib/page-shell.mjs';
import { CATEGORY, EVIDENCE, SHAPES, STATUS, shapeClasses } from '../src/data/taxonomy.js';
import { CASES } from '../src/data/cases/index.js';

const SITE = 'https://example.github.io/app/';
const groups = browseGroups(CASES);
const ldOf = (page) => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(blocks).toHaveLength(1);
  return JSON.parse(blocks[0][1]);
};

describe('browse groups', () => {
  it('has a group for each kind, none under the minimum, each case list in date order', () => {
    for (const { kind } of KINDS) expect(groups.some((g) => g.kind === kind), kind).toBe(true);
    for (const g of groups) {
      expect(g.cases.length, `${g.kind}/${g.slug}`).toBeGreaterThanOrEqual(MIN_CASES);
      const dates = g.cases.map((c) => c.date);
      expect(dates, g.slug).toEqual([...dates].sort());
    }
  });

  it('gives every group its own address', () => {
    expect(new Set(groups.map(groupPath)).size).toBe(groups.length);
    for (const g of groups) expect(groupPath(g)).toMatch(/^browse\/[a-z]+\/[a-z0-9-]+\/$/);
  });

  it('puts exactly the matching cases in each group', () => {
    const find = (kind, slug) => groups.find((g) => g.kind === kind && g.slug === slug);
    expect(find('country', 'fr').cases.map((c) => c.cc)).toEqual(Array(find('country', 'fr').cases.length).fill('FR'));
    expect(find('status', 'unresolved').cases).toHaveLength(CASES.filter((c) => c.status === 'unresolved').length);
    expect(find('evidence', 'radar').cases).toHaveLength(CASES.filter((c) => (c.evidence || []).includes('radar')).length);
    expect(find('shape', 'triangle').cases).toHaveLength(CASES.filter((c) => shapeClasses(c.shape).includes('triangle')).length);
    expect(find('decade', '1950s').cases.every((c) => /^195\d/.test(c.date))).toBe(true);
    expect(find('decade', 'before-1900').cases.every((c) => Number(c.date.slice(0, 4)) < 1900)).toBe(true);
  });

  it('names countries from their ISO codes, and not the "several countries" code', () => {
    expect(countryName('gb')).toBe('United Kingdom');
    expect(countryName('US')).toBe('United States');
    expect(countryName('xx')).toBe('');
    expect(groups.filter((g) => g.kind === 'country').map((g) => g.slug)).not.toContain('xx');
  });

  it('words every category, evidence and shape in the data', () => {
    for (const k of Object.keys(CATEGORY)) expect(CATEGORY_PLURAL[k], k).toBeTruthy();
    for (const k of Object.keys(EVIDENCE)) expect(EVIDENCE_PHRASE[k], k).toBeTruthy();
    for (const k of Object.keys(SHAPES)) expect(SHAPE_PHRASE[k], k).toBeTruthy();
  });

  it('summarises how a group splits by status', () => {
    expect(statusMix(CASES.filter((c) => c.status === 'unresolved').slice(0, 3))).toBe('3 unresolved');
    expect(statusMix([{ status: 'explained' }, { status: 'disputed' }, { status: 'disputed' }])).toBe('2 disputed, 1 explained');
  });

  it('finds the groups a case belongs to', () => {
    const nimitz = CASES.find((c) => c.id === 'nimitz-tic-tac-2004');
    const mine = groupsOf(nimitz, groups).map((g) => `${g.kind}:${g.slug}`);
    expect(mine).toContain('country:us');
    expect(mine).toContain('status:unresolved');
    expect(mine).toContain('evidence:radar');
    expect(mine).toContain('decade:2000s');
  });
});

describe('browse pages', () => {
  it('writes each group as a page with its cases, siblings and structured data', () => {
    for (const g of groups) {
      const page = groupPage(g, { site: SITE, groups });
      expect(page).toContain(`<link rel="canonical" href="${SITE}${groupPath(g)}">`);
      for (const c of g.cases) expect(page).toContain(`href="../../../case/${c.id}/"`);
      const ld = ldOf(page);
      expect(ld['@graph'][0].mainEntity.numberOfItems).toBe(g.cases.length);
      expect(ld['@graph'][1].itemListElement).toHaveLength(3);
      expect(page).not.toMatch(/undefined|\[object Object\]|NaN/);
    }
  });

  it('links each page to the groups of the same kind', () => {
    const fr = groups.find((g) => g.kind === 'country' && g.slug === 'fr');
    const page = groupPage(fr, { site: SITE, groups });
    expect(page).toContain('href="../us/"');
    expect(page).not.toContain('href="../fr/"');
  });

  it('lists every group on the browse page', () => {
    const page = browseIndex(CASES, { site: SITE, groups });
    for (const g of groups) expect(page).toContain(`href="${g.kind}/${g.slug}/"`);
    expect(ldOf(page).hasPart).toHaveLength(groups.length);
  });

  it('only links to pages that exist', () => {
    const pages = new Set(['', 'case/', 'browse/', 'open-data/', ...groups.map(groupPath), ...CASES.map((c) => `case/${c.id}/`)]);
    const resolve = (from, rel) => {
      const parts = from.split('/').filter(Boolean);
      for (const seg of rel.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg && seg !== '.') parts.push(seg);
      }
      return parts.length ? `${parts.join('/')}/` : '';
    };
    const check = (from, html) => {
      for (const m of html.matchAll(/href="(\.\.?\/[^"#]*)"/g)) {
        if (/\.(svg|jpg|png)$/.test(m[1])) continue;
        expect(pages.has(resolve(from, m[1])), `${from} → ${m[1]}`).toBe(true);
      }
    };
    check('browse/', browseIndex(CASES, { site: SITE, groups }));
    for (const g of groups) check(groupPath(g), groupPage(g, { site: SITE, groups }));
    check('case/', caseIndex(CASES, { site: SITE }));
    for (const c of CASES.slice(0, 40)) check(`case/${c.id}/`, casePage(c, { site: SITE, groups: groupsOf(c, groups) }));
  });

  it('adds a case page\'s groups to it, and the groups to the sitemap', () => {
    const c = CASES.find((x) => x.id === 'nimitz-tic-tac-2004');
    const page = casePage(c, { site: SITE, groups: groupsOf(c, groups) });
    expect(page).toContain('<h2>Browse</h2>');
    expect(page).toContain('href="../../browse/status/unresolved/"');
    const xml = sitemap(SITE, ['a'], '2026-01-01', groups.map(groupPath));
    expect(xml).toContain(`<loc>${SITE}browse/</loc>`);
    expect(xml).toContain(`<loc>${SITE}browse/country/fr/</loc>`);
    // the app, the case list, the browse index, the open data, every group and the one case
    expect(xml.match(/<loc>/g)).toHaveLength(4 + groups.length + 1);
  });

  it('shares one page frame, with search and preview tags', () => {
    const page = pageShell({ site: SITE, root: '../', url: `${SITE}x/`, title: 'T & "t"', description: 'D', ld: { a: '</script>' }, body: '<p>b</p>' });
    expect(page).toContain('<title>T &amp; &quot;t&quot;</title>');
    expect(page).toContain('<meta name="robots" content="index,follow,max-image-preview:large">');
    expect(page).not.toContain('</script><');
    expect(page).toContain(`<meta property="og:image" content="${SITE}og.jpg">`);
  });

  it('has every status named in the taxonomy', () => {
    for (const g of groups.filter((x) => x.kind === 'status')) expect(STATUS[g.slug]).toBeTruthy();
    expect(existsSync('scripts/lib/browse-pages.mjs')).toBe(true);
  });
});
