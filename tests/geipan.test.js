import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, skeleton, buildVocabulary, repairAccents, parseCaseName, timeZoneFor, localToUtc } from '../scripts/build-geipan.mjs';
import { decodeGeipan, classInfo, geipanDate, caseUrl, translateUrl, bodiesNamed, fold, GEIPAN_CLASSES } from '../src/services/geipan.js';
import { STATUS } from '../src/data/taxonomy.js';

describe('GEIPAN build', () => {
  it('reads semicolon CSV with quoted separators, quotes and newlines', () => {
    const rows = parseCsv('a;b;c\n1;"x;y";"say ""hi""\nthere"\r\n2;;3\n');
    expect(rows).toEqual([
      { a: '1', b: 'x;y', c: 'say "hi"\nthere' },
      { a: '2', b: '', c: '3' },
    ]);
  });

  it('restores accents from a vocabulary of correctly accented text', () => {
    const vocab = buildVocabulary(['Le témoin a observé une lumière très brillante', 'le témoin', 'Côte-d’Or']);
    expect(skeleton('Témoin')).toBe('t�moin');
    expect(repairAccents('Le t�moin a observ� une lumi�re', vocab)).toBe('Le témoin a observé une lumière');
    expect(repairAccents('T�MOIN', vocab)).toBe('TÉMOIN');
    // Elided articles take a curly apostrophe; a broken character after digits is a degree sign.
    expect(repairAccents('l�objet � 45�', vocab)).toBe('l’objet à 45°');
    expect(repairAccents('rien à réparer', vocab)).toBe('rien à réparer');
  });

  it('parses case names in every published form', () => {
    expect(parseCaseName('ILLKIRCH-GRAFFENSTADEN (67) 22.11.1996')).toEqual({ place: 'ILLKIRCH-GRAFFENSTADEN', dept: '67', cc: null, y: 1996, m: 11, d: 22 });
    expect(parseCaseName('MARIGOT (LE) (971) 01.02.2010')).toMatchObject({ place: 'LE MARIGOT', dept: '971' });
    expect(parseCaseName("ISLE (L') (87) 03.04.2005")).toMatchObject({ place: "L'ISLE" });
    // Year only, no space before the department, unknown day, decade only.
    expect(parseCaseName('SAUMUR (49) 1978')).toEqual({ place: 'SAUMUR', dept: '49', cc: null, y: 1978, m: null, d: null });
    expect(parseCaseName('DOL DE BRETAGNE(35) 1978')).toMatchObject({ place: 'DOL DE BRETAGNE', dept: '35' });
    expect(parseCaseName('MERS-EL-KEBIR (DZ.31) --.08.1954')).toEqual({ place: 'MERS-EL-KEBIR', dept: null, cc: 'DZ', y: 1954, m: 8, d: null });
    expect(parseCaseName('TERNANT (21) --.--.199-')).toMatchObject({ place: 'TERNANT', y: null, m: null, d: null });
    expect(parseCaseName('[MER] LAT -1.22, LON -81.12 (EC.M) 26.05.1979')).toMatchObject({ place: 'LAT -1.22, LON -81.12', cc: 'EC' });
    expect(parseCaseName('no date here')).toBeNull();
  });

  it('converts local observation times to UTC across summer time and overseas', () => {
    expect(timeZoneFor('04')).toBe('Europe/Paris');
    expect(timeZoneFor('974')).toBe('Indian/Reunion');
    expect(timeZoneFor(null, 'DZ')).toBe('Africa/Algiers');
    expect(localToUtc(1965, 7, 1, 5, 45, 'Europe/Paris')).toBe('1965-07-01T04:45Z'); // no French DST in 1965
    expect(localToUtc(1996, 11, 22, 18, 30, 'Europe/Paris')).toBe('1996-11-22T17:30Z');
    expect(localToUtc(2010, 7, 14, 23, 0, 'Europe/Paris')).toBe('2010-07-14T21:00Z');
    expect(localToUtc(2012, 3, 10, 20, 0, 'Indian/Reunion')).toBe('2012-03-10T16:00Z');
  });
});

describe('GEIPAN service', () => {
  it('maps every class to a known status', () => {
    for (const [cls, info] of Object.entries(GEIPAN_CLASSES)) {
      expect(STATUS[info.status], cls).toBeTruthy();
      expect(info.long.length).toBeGreaterThan(20);
    }
    expect(classInfo('A').status).toBe('identified');
    expect(classInfo('D1').status).toBe('unresolved');
    expect(classInfo('X').status).toBe('unassessed');
  });

  it('formats partial dates and links', () => {
    expect(geipanDate({ year: 1965, month: 7, day: 1 })).toBe('1 Jul 1965');
    expect(geipanDate({ year: 1978, month: 3, day: null })).toBe('Mar 1978');
    expect(geipanDate({ year: 1978, month: null })).toBe('1978');
    expect(caseUrl({ id: '1981-01-00001' })).toBe('https://www.cnes-geipan.fr/fr/cas/1981-01-00001');
    const url = new URL(translateUrl('x'.repeat(5000)));
    expect(url.searchParams.get('sl')).toBe('fr');
    expect(url.searchParams.get('text')).toHaveLength(1800);
  });

  it('names bodies in French text without reading the month of March as Mars', () => {
    expect(bodiesNamed('le 15 mars 1990, la planète Vénus et la Lune')).toBe('Venus Moon');
    expect(bodiesNamed('observée près de la planète Mars')).toBe('Mars');
    expect(fold('Évry-Courcouronnes')).toBe('evry-courcouronnes');
  });
});

describe('GEIPAN dataset', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data/geipan.json', import.meta.url), 'utf8'));
  const { records, byId } = decodeGeipan(data);

  it('has every published case with a unique id, a year and a class', () => {
    expect(records.length).toBeGreaterThan(2500);
    expect(byId.size).toBe(records.length);
    for (const r of records) {
      expect(r.id, r.id).toMatch(/^\d{4}-\d{2}-\d{5}$/);
      expect(r.year, r.id).toBeGreaterThanOrEqual(1930);
      expect(Object.keys(GEIPAN_CLASSES), r.id).toContain(r.cls);
      expect(r.short.includes('�') || r.summary.includes('�'), r.id).toBe(false);
    }
  });

  it('places most cases at their commune, inside France or its territories', () => {
    const placed = records.filter((r) => r.lat != null);
    expect(placed.length / records.length).toBeGreaterThan(0.95);
    expect(records.filter((r) => r.prec === 2).length / records.length).toBeGreaterThan(0.9);
    for (const r of placed) {
      expect(Math.abs(r.lat), r.id).toBeLessThanOrEqual(90);
      expect(Math.abs(r.lon), r.id).toBeLessThanOrEqual(180);
    }
    const metro = placed.filter((r) => /^(\d{2}|2[AB])$/.test(r.dept) && r.place !== 'At sea');
    for (const r of metro) {
      expect(r.lat, `${r.id} ${r.place}`).toBeGreaterThan(41);
      expect(r.lat, `${r.id} ${r.place}`).toBeLessThan(51.2);
      expect(r.lon, `${r.id} ${r.place}`).toBeGreaterThan(-5.5);
      expect(r.lon, `${r.id} ${r.place}`).toBeLessThan(10);
    }
  });

  it('keeps observation times only when they fall on the case date', () => {
    const timed = records.filter((r) => r.utc);
    expect(timed.length).toBeGreaterThan(2000);
    for (const r of timed) {
      expect(r.month && r.day, r.id).toBeTruthy();
      expect(Math.abs(Date.parse(r.utc) - Date.UTC(r.year, r.month - 1, r.day)), r.id).toBeLessThan(1.5 * 86400e3);
      expect(r.localTime, r.id).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('includes the landmark French cases', () => {
    const valensole = records.find((r) => r.place === 'Valensole' && r.year === 1965);
    expect(valensole?.utc).toBe('1965-07-01T04:45Z');
    const trans = records.find((r) => r.place === 'Trans-en-Provence' && r.year === 1981);
    expect(trans?.cls).toMatch(/^D/);
  });
});
