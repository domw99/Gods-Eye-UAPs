import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { nearestAirfields, airfieldProximity, SIZES } from '../src/services/airfields.js';
import { airfieldsFrom, parseCsv } from '../scripts/build-airfields.mjs';
import { CASES } from '../src/data/cases/index.js';

const data = JSON.parse(readFileSync('public/data/airfields.json', 'utf8'));

describe('airfields near a place', () => {
  it('holds ten thousand or more, sorted by latitude, in the fields it says', () => {
    expect(data.fields).toEqual(['name', 'lat', 'lon', 'size', 'code', 'country', 'military']);
    expect(data.airfields.length).toBeGreaterThan(10_000);
    const lats = data.airfields.map((a) => a[1]);
    expect(lats).toEqual([...lats].sort((a, b) => a - b));
    expect(new Set(data.airfields.map((a) => a[3]))).toEqual(new Set([0, 1, 2]));
    expect(SIZES).toHaveLength(3);
  });

  it('finds the airfield a case happened at: Minot Air Force Base, North Dakota', () => {
    const minot = CASES.find((c) => c.id.startsWith('minot'));
    const [first] = nearestAirfields(data, minot.lat, minot.lon);
    expect(first.name).toMatch(/Minot/);
    expect(first.military).toBe(true);
    expect(first.km).toBeLessThan(15);
  });

  it('lists the nearest first, within the distance asked, no more than the limit', () => {
    const list = nearestAirfields(data, 51.5, -0.12, { limit: 5, maxKm: 60 });
    expect(list).toHaveLength(5);
    const km = list.map((a) => a.km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    expect(km.at(-1)).toBeLessThanOrEqual(60);
    expect(list[0]).toMatchObject({ code: expect.any(String), size: expect.any(Number), bearing: expect.any(Number) });
    expect(nearestAirfields(data, 51.5, -0.12, { limit: 2 })).toHaveLength(2);
  });

  it('finds nothing in the middle of an ocean, or without data', () => {
    expect(nearestAirfields(data, 30.6, -118.2)).toEqual([]); // the Nimitz encounter, 100 miles off San Diego
    expect(nearestAirfields(null, 51.5, -0.12)).toEqual([]);
  });

  it('works across the date line and the poles without throwing', () => {
    for (const [lat, lon] of [[-89.9, 0], [89.9, 180], [0, 179.99], [0, -179.99], [-17.7, 178.1]]) expect(() => nearestAirfields(data, lat, lon)).not.toThrow();
    expect(nearestAirfields(data, -17.7, 178.1).length).toBeGreaterThan(0); // Fiji, near the date line
  });

  it('says when an airfield is near enough to make aircraft the likely cause', () => {
    expect(airfieldProximity(8, 0)).toBe('close');
    expect(airfieldProximity(30, 1)).toBe('near');
    expect(airfieldProximity(60, 0)).toBeNull();
    expect(airfieldProximity(12, 2)).toBe('near'); // a small field counts for less
    expect(airfieldProximity(5, 2)).toBe('close');
  });
});

describe('the airfields builder', () => {
  const csv = [
    'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords',
    '1,KAAA,large_airport,"Big, International Airport",40.123456,-100.987654,100,NA,US,US-NE,Town,yes,KAAA,AAA,KAAA,AAA,,,',
    '2,KBBB,small_airport,Tiny Strip,41,-101,100,NA,US,US-NE,Town,no,,,KBBB,BBB,,,',
    '3,KCCC,small_airport,Smith Air Force Base,42,-102,100,NA,US,US-NE,Town,no,,,KCCC,CCC,,,',
    '4,KDDD,heliport,Hospital Pad,43,-103,0,NA,US,US-NE,Town,no,,,KDDD,DDD,,,',
    '5,KEEE,closed,Old Field,44,-104,0,NA,US,US-NE,Town,no,,,KEEE,EEE,,,',
    '6,KFFF,medium_airport,"The ""Quoted"" Field",45,-105,0,NA,US,US-NE,Town,no,KFFF,,KFFF,FFF,,,',
  ].join('\r\n');

  it('reads quoted fields', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
  });

  it('keeps big and medium airports, small ones with a code or flights or a military name, and leaves out the rest', () => {
    const list = airfieldsFrom(csv);
    expect(list.map((a) => a[0])).toEqual(['Big, International Airport', 'Smith Air Force Base', 'The "Quoted" Field'].sort((a, b) => 0 || list.findIndex((x) => x[0] === a) - list.findIndex((x) => x[0] === b)));
    expect(list.find((a) => a[0].startsWith('Big'))).toEqual(['Big, International Airport', 40.123, -100.988, 0, 'KAAA', 'US', 0]);
    expect(list.find((a) => a[0].startsWith('Smith'))[6]).toBe(1);
    expect(list.some((a) => /Tiny|Hospital|Old/.test(a[0]))).toBe(false);
  });
});
