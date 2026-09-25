import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseIssueName, findPlaces, sightingContext, quote, caseTerms } from '../scripts/build-mufon.mjs';
import { CASES } from '../src/data/cases/index.js';
import { decodeMufon, issueDate, issueLabel, pageNumber, embedUrl, readerUrl } from '../src/services/mufon.js';

// A tiny gazetteer standing in for GeoNames.
const REGIONS = {
  Kansas: { key: 'US.KS', label: 'Kansas', cc: 'US' },
  Texas: { key: 'US.TX', label: 'Texas', cc: 'US' },
  TX: { key: 'US.TX', label: 'Texas', cc: 'US' },
  'New Mexico': { key: 'US.NM', label: 'New Mexico', cc: 'US' },
  England: { key: 'GB.ENG', label: 'England', cc: 'GB' },
};
const TOWNS = {
  'US.KS|Delphos': { name: 'Delphos', lat: 39.27, lon: -97.77 },
  'US.TX|Fort Worth': { name: 'Fort Worth', lat: 32.73, lon: -97.32 },
  'US.TX|Seguin': { name: 'Seguin', lat: 29.57, lon: -97.96 },
  'US.NM|Socorro': { name: 'Socorro', lat: 34.06, lon: -106.89 },
  'GB.ENG|Warminster': { name: 'Warminster', lat: 51.2, lon: -2.18 },
};
const resolveRegion = (t) => REGIONS[t] || null;
const lookup = (cand, region) => TOWNS[`${region.key}|${cand}`] || null;

describe('MUFON journal build', () => {
  it('reads issue file names', () => {
    expect(parseIssueName('1978_01')).toEqual({ year: 1978, month: 1, monthTo: null });
    expect(parseIssueName('1968_02-03')).toEqual({ year: 1968, month: 2, monthTo: 3 });
    expect(parseIssueName('1971-06')).toEqual({ year: 1971, month: 6, monthTo: null });
    expect(parseIssueName('cover')).toBeNull();
  });

  it('finds "Town, State" places and prefers the longest town name', () => {
    const text = 'On November 2, 1971, a glowing object landed on a farm near Delphos, Kansas and left a ring. Witnesses in Fort Worth, TX saw lights.';
    const found = findPlaces(text, resolveRegion, lookup);
    expect(found.map((f) => f.place)).toEqual(['Delphos, Kansas', 'Fort Worth, Texas']);
    expect(text.slice(found[0].index, found[0].index + found[0].length)).toBe('Delphos, Kansas');
  });

  it('reads two-word regions and headline capitals', () => {
    const found = findPlaces('THE SOCORRO, NEW MEXICO LANDING and Warminster, England sightings', (t) => REGIONS[t] || REGIONS[t.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase())] || null, (c, r) => lookup(c[0] + c.slice(1).toLowerCase(), r));
    expect(found.map((f) => f.place)).toEqual(['Socorro, New Mexico', 'Warminster, England']);
  });

  it('skips names that are not places', () => {
    expect(findPlaces('Walter H. Andrus, Director of MUFON, said', resolveRegion, lookup)).toEqual([]);
  });

  it('keeps sighting reports and drops addresses and meetings', () => {
    const report = 'Two deputies saw a bright disc hover over the highway near Delphos, Kansas for ten minutes.';
    const address = 'The MUFON UFO JOURNAL 103 Oldtowne Rd. Seguin, Texas 78155. Subscription rates: $8.00 per year.';
    const meeting = 'The annual symposium will be held at the Hilton Hotel, Fort Worth, Texas in July.';
    const at = (t, s) => [t.indexOf(s), s.length];
    expect(sightingContext(report, ...at(report, 'Delphos, Kansas'))).toBe(true);
    expect(sightingContext(address, ...at(address, 'Seguin, Texas'))).toBe(false);
    expect(sightingContext(meeting, ...at(meeting, 'Fort Worth, Texas'))).toBe(false);
  });

  it('drops hometowns and letter signatures', () => {
    const hometown = 'The witness, Francis de John of Pasadena, California, saw a glowing object hover.';
    const moved = 'Our director is moving to Seguin, Texas, and will keep investigating sightings.';
    const signed = 'I believe the lights I saw were real. Virgil Staff Berkeley, Calif. 17';
    const dateline = 'PASCAGOULA, Mississippi (UPI) — Two shipyard workers said they saw a craft and were taken aboard.';
    const at = (t, s) => [t.indexOf(s), s.length];
    expect(sightingContext(hometown, ...at(hometown, 'Pasadena, California'))).toBe(false);
    expect(sightingContext(moved, ...at(moved, 'Seguin, Texas'))).toBe(false);
    expect(sightingContext(signed, ...at(signed, 'Berkeley, Calif'))).toBe(false);
    expect(sightingContext(dateline, ...at(dateline, 'PASCAGOULA, Mississippi'))).toBe(true);
  });

  it('quotes a short excerpt around a mention', () => {
    const text = `${'word '.repeat(60)}Delphos, Kansas${' more'.repeat(60)}`;
    const q = quote(text, text.indexOf('Delphos'), 15, 40);
    expect(q).toContain('Delphos, Kansas');
    expect(q.startsWith('…')).toBe(true);
    expect(q.endsWith('…')).toBe(true);
    expect(q.length).toBeLessThan(110);
  });

  it('picks distinctive search terms for curated cases', () => {
    const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
    expect(caseTerms(byId['socorro-1964'] || CASES.find((c) => /Socorro/.test(c.title)))).toContain('Socorro');
    for (const c of CASES) for (const t of caseTerms(c)) expect(t).toMatch(/^[A-Z][a-z]/);
  });
});

describe('MUFON service', () => {
  const data = {
    issues: [['1978_01', 1978, 1, null, 122, 'MUFON UFO Journal', 21, 1], ['1968_02-03', 1968, 2, 3, null, 'Skylook', 12, 0]],
    placeNames: ['Santa Monica, California'],
    places: [[34.02, -118.49, 0, 3, 0, '…seen over Santa Monica, California, January 1, 1978…']],
    cases: {},
  };
  const m = decodeMufon(data);

  it('unpacks issues and places', () => {
    expect(m.issues[0]).toMatchObject({ id: '1978_01', year: 1978, number: 122, cover: true, pages: 21 });
    expect(m.records[0]).toMatchObject({ place: 'Santa Monica, California', issue: 0, leaf: 3, year: 1978, month: 1 });
    expect(m.byIssueId.get('1968_02-03').title).toBe('Skylook');
  });

  it('labels issues and pages', () => {
    expect(issueDate(m.issues[0])).toBe('January 1978');
    expect(issueDate(m.issues[1])).toBe('February–March 1968');
    expect(issueLabel(m.issues[0])).toBe('MUFON UFO Journal No. 122, January 1978');
    // The Black Vault cover sheet is leaf 0, so leaf 3 is printed page 3; without it, leaf 3 is page 4.
    expect(pageNumber(m.issues[0], 3)).toBe(3);
    expect(pageNumber(m.issues[1], 3)).toBe(4);
  });

  it('links to the right page of the Internet Archive reader', () => {
    expect(embedUrl(m.issues[0], 3)).toBe('https://archive.org/embed/MUFON_UFO_Journal_-_Skylook/1978_01/page/n3/mode/1up');
    expect(readerUrl(m.issues[0], 3)).toBe('https://archive.org/details/MUFON_UFO_Journal_-_Skylook/1978_01/page/n3/mode/1up');
  });
});

describe('MUFON dataset', () => {
  let data = null;
  try {
    data = JSON.parse(readFileSync(new URL('../public/data/mufon.json', import.meta.url), 'utf8'));
  } catch {
    /* built by scripts/build-mufon.mjs */
  }
  it.skipIf(!data)('has issues, placed mentions and case coverage in the expected shape', () => {
    expect(data.issues.length).toBeGreaterThan(400);
    const [id, year, month] = data.issues[0];
    expect(id).toMatch(/^\d{4}[_-]\d{2}/);
    expect(year).toBeGreaterThanOrEqual(1967);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(data.places.length).toBeGreaterThan(1000);
    for (const [lat, lon, issue, leaf, place, q] of data.places) {
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(data.issues[issue]).toBeDefined();
      expect(leaf).toBeLessThan(data.issues[issue][6]);
      expect(data.placeNames[place]).toBeTruthy();
      expect(q.length).toBeLessThan(300);
    }
    const ids = new Set(CASES.map((c) => c.id));
    for (const [caseId, v] of Object.entries(data.cases)) {
      expect(ids.has(caseId)).toBe(true);
      expect(v.hits.length).toBeGreaterThan(0);
      for (const [issue] of v.hits) expect(data.issues[issue]).toBeDefined();
    }
  });
});
