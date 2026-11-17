import { describe, it, expect } from 'vitest';
import { listRecord, listCsv, listGeoJson, describeFilters, exportName, LIST_COLUMNS } from '../src/data/listexport.js';
import { CASE_ITEMS, officialToItem, userToItem } from '../src/data/items.js';
import { csvField } from '../src/util/csv.js';
import { csvField as openDataCsvField } from '../scripts/lib/open-data.mjs';

const SITE = 'https://example.github.io/app/';
const official = officialToItem({
  dvidsId: '1007777',
  title: 'Unresolved UAP over the "Middle East"',
  year: 2023,
  type: 'video',
  status: 'unresolved',
  description: 'Infrared video',
  location: { name: 'Middle East', lat: 29, lon: 47, precision: 'region', radiusKm: 800 },
});
const undated = officialToItem({ dvidsId: '42', title: '=cmd', type: 'image', status: 'unknown', description: '' }); // no date, no place
const mine = userToItem({ id: 'u1', date: '2026-10-01T21:00:00Z', lat: 51.5, lon: -0.1, title: 'Light over the river' });

describe('exporting the list', () => {
  it('writes a case with the date as recorded, its explanation and its page', () => {
    const item = CASE_ITEMS.find((i) => i.id === 'phoenix-lights-1997');
    const r = listRecord(item, SITE);
    expect(r).toMatchObject({ kind: 'case', id: 'phoenix-lights-1997', date: item.ref.date, status: item.ref.status, link: `${SITE}case/phoenix-lights-1997/` });
    expect(r.latitude).toBe(item.ref.lat);
    expect(r.timeApproximate).toBe(item.ref.timeApprox === true);
    expect(r.explanation).toBe(item.ref.explanation ?? null);
  });

  it('does not invent a date or a precise place for an official release', () => {
    const r = listRecord(official, SITE);
    expect(r.date).toBe('2023'); // the year it gave, not the 1 January the list sorts it by
    expect(r).toMatchObject({ locationPrecision: 'region', radiusKm: 800, link: `${SITE}#/official/1007777` });
    const blank = listRecord(undated, SITE);
    expect(blank.date).toBeNull();
    expect(blank.latitude).toBeNull();
  });

  it('gives your own sightings no link, since they live only in this browser', () => {
    expect(listRecord(mine, SITE)).toMatchObject({ kind: 'user', date: '2026-10-01T21:00:00Z', link: null });
  });

  it('writes a CSV with one row per record, quoted and safe to open in a spreadsheet', () => {
    const records = [official, undated, mine].map((i) => listRecord(i, SITE));
    const csv = listCsv(records);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(LIST_COLUMNS.join(','));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('"Unresolved UAP over the ""Middle East"""');
    expect(lines[1]).toContain('official-document | video | sensor-data');
    expect(lines[2]).toContain("'=cmd"); // a title that starts like a formula is not run
    expect(csv).not.toMatch(/undefined|NaN|\[object Object\]/);
  });

  it('writes GeoJSON points for the placed records and says how many had no position', () => {
    const records = [official, undated, mine, ...CASE_ITEMS.slice(0, 3)].map((i) => listRecord(i, SITE));
    const geo = listGeoJson(records, { filters: { search: 'x' }, exported: '2026-10-27T00:00:00Z', site: SITE });
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.metadata).toMatchObject({ records: 6, withoutPosition: 1, filters: { search: 'x' }, exported: '2026-10-27T00:00:00Z', source: SITE });
    expect(geo.features).toHaveLength(5);
    const f = geo.features.find((x) => x.id === 'official:1007777');
    expect(f.geometry.coordinates).toEqual([47, 29]);
    expect(f.properties.radiusKm).toBe(800);
    for (const x of geo.features) for (const c of x.geometry.coordinates) expect(Number.isFinite(c)).toBe(true);
  });

  it('records the filters in force and leaves out the empty ones', () => {
    const s = {
      search: 'radar', yearRange: [1950, 1959], evidence: new Set(['radar']), shape: new Set(), status: new Set(['unresolved']), starredOnly: false,
      layers: { cases: true, official: false, user: true, bluebook: true },
    };
    expect(describeFilters(s)).toEqual({ search: 'radar', years: [1950, 1959], evidence: ['radar'], status: ['unresolved'], layers: ['cases', 'user'] });
  });

  it('names the file by the day', () => {
    expect(exportName('csv', new Date('2026-10-27T15:00:00Z'))).toBe('gods-eye-uap-list-2026-10-27.csv');
  });

  it('shares one CSV writer with the open data', () => {
    expect(openDataCsvField).toBe(csvField);
  });
});
