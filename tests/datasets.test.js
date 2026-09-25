import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { GOV_FILES } from '../src/data/govFiles.js';
import { parseIdentifier } from '../scripts/build-bluebook.mjs';
import { officialToItem } from '../src/data/items.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), 'utf8'));

describe('official U.S. footage catalogue', () => {
  const data = json('official-uap-media.json');
  it('has items with DVIDS ids, pages and embeds', () => {
    expect(data.items.length).toBeGreaterThan(100);
    for (const o of data.items) {
      expect(o.dvidsId).toMatch(/^\d+$/);
      expect(o.page).toMatch(/^https:\/\/www\.dvidshub\.net\//);
      if (o.type === 'video') expect(o.embed).toBe(`https://www.dvidshub.net/video/embed/${o.dvidsId}`);
      if (o.location) {
        expect(Math.abs(o.location.lat)).toBeLessThanOrEqual(90);
        expect(o.location.radiusKm).toBeGreaterThan(0);
      }
    }
  });
  it('normalises to list items', () => {
    const item = officialToItem(data.items[0]);
    expect(item.key).toBe(`official:${data.items[0].dvidsId}`);
    expect(['unresolved', 'explained', 'unassessed']).toContain(item.status);
  });
});

describe('Project Blue Book layer', () => {
  it('parses Blue Book identifiers', () => {
    expect(parseIdentifier('1966-04-7104469-Ravenna-Mantua-Ohio')).toMatchObject({ year: 1966, month: 4, naid: '7104469', tokens: ['Ravenna', 'Mantua', 'Ohio'] });
    expect(parseIdentifier('1948-Summer-9670446-Bedford-Va')).toMatchObject({ year: 1948, month: null, tokens: ['Bedford', 'Va'] });
    expect(parseIdentifier('1952-07-7273984-Tremonton-Utah-1377-').tokens).toEqual(['Tremonton', 'Utah']);
  });
  it('places most files', () => {
    const bb = json('bluebook.json');
    expect(bb.records.length).toBeGreaterThan(10000);
    const placed = bb.records.filter((r) => r[1] != null).length;
    expect(placed / bb.records.length).toBeGreaterThan(0.9);
    const tremonton = bb.records.find((r) => r[0].startsWith('1952-07-7273984'));
    expect(tremonton[4]).toMatch(/Tremonton/);
  });
});

describe('NUFORC layer', () => {
  it('is columnar and consistent', () => {
    if (!existsSync(new URL('../public/data/nuforc.json', import.meta.url))) return;
    const n = json('nuforc.json');
    for (const col of ['lat', 'lon', 'date', 'shape', 'dur', 'place']) expect(n[col].length).toBe(n.count);
    expect(n.comments).toBeUndefined(); // narratives are never shipped
  });
});

describe('government files library', () => {
  it('links only over https and has content', () => {
    for (const f of GOV_FILES) {
      expect(f.text.length).toBeGreaterThan(40);
      for (const l of f.links || []) expect(l.url).toMatch(/^https:\/\//);
      for (const d of f.commons || []) expect(d.file).toMatch(/^File:/);
    }
  });
});
