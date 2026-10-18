import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireballRows, fireballsNear, fireballSize, describeEnergy, FIREBALLS_FROM, fireballsCover } from '../src/services/fireballs.js';
import { rankCandidates } from '../src/services/explain.js';
import { skyAt } from '../src/services/sky.js';
import { pack } from '../scripts/build-fireballs.mjs';

const data = JSON.parse(readFileSync('public/data/fireballs.json', 'utf8'));
const rows = fireballRows(data);

describe('the bundled fireball record', () => {
  it('runs from 1988 to recently, oldest first, with every event placed on the Earth', () => {
    expect(rows.length).toBeGreaterThan(800);
    expect(new Date(rows[0].time).getUTCFullYear()).toBe(FIREBALLS_FROM);
    expect(rows.every((r, i) => i === 0 || r.time >= rows[i - 1].time)).toBe(true);
    expect(rows.every((r) => Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180)).toBe(true);
    expect(data.license).toMatch(/public domain/);
  });

  it('has the Chelyabinsk fireball of 15 February 2013 (about 440 kt) with its place, height and speed', () => {
    const c = rows.find((r) => Math.abs(r.time - Date.UTC(2013, 1, 15, 3, 20, 26)) < 120e3);
    expect(c.impactKt).toBeGreaterThan(400);
    expect(c.lat).toBeCloseTo(54.8, 0);
    expect(c.lon).toBeCloseTo(61.1, 0);
    expect(c.heightKm).toBeCloseTo(23.3, 0);
    expect(c.speed).toBeCloseTo(18.6, 0);
  });
});

describe('what the record covers', () => {
  it('starts on 15 April 1988, so earlier that year has nothing to check against', () => {
    expect(fireballsCover('1988-01-20T12:00:00Z')).toBe(false);
    expect(fireballsCover('1988-04-15T00:00:00Z')).toBe(true);
    expect(fireballsCover('2013-02-15T03:30:00Z')).toBe(true);
    expect(fireballsCover('nonsense')).toBe(false);
  });
});

describe('fireballsNear', () => {
  it('finds Chelyabinsk from a witness 150 km away ten minutes later, and gives the gap, distance and bearing', () => {
    const [f] = fireballsNear(rows, '2013-02-15T03:30:00Z', 56, 63, { hours: 2 });
    expect(f.impactKt).toBeGreaterThan(400);
    expect(f.gapMin).toBeCloseTo(-9.6, 0);
    expect(f.km).toBeGreaterThan(100);
    expect(f.km).toBeLessThan(300);
    expect(f.bearing).toBeGreaterThan(180);
    expect(f.bearing).toBeLessThan(270);
  });

  it('leaves out a fireball too far away or too long before or after', () => {
    expect(fireballsNear(rows, '2013-02-15T03:30:00Z', 40, 63, { hours: 2 })).toEqual([]);
    expect(fireballsNear(rows, '2013-02-15T09:30:00Z', 56, 63, { hours: 2 })).toEqual([]);
    expect(fireballsNear(rows, '2013-02-15T09:30:00Z', 56, 63, { hours: 8 })).toHaveLength(1);
  });

  it('puts the closest in time first and limits the list', () => {
    const rowsNear = [
      { time: Date.UTC(2020, 0, 1, 0, 0), lat: 10, lon: 10 },
      { time: Date.UTC(2020, 0, 1, 1, 0), lat: 10, lon: 10 },
      { time: Date.UTC(2020, 0, 1, 2, 30), lat: 10, lon: 10 },
    ];
    const found = fireballsNear(rowsNear, Date.UTC(2020, 0, 1, 1, 10), 10, 10, { hours: 3, limit: 2 });
    expect(found.map((f) => f.time)).toEqual([Date.UTC(2020, 0, 1, 1, 0), Date.UTC(2020, 0, 1, 0, 0)]);
  });

  it('gives nothing for a bad date or an empty record', () => {
    expect(fireballsNear(rows, 'nonsense', 0, 0)).toEqual([]);
    expect(fireballsNear([], Date.now(), 0, 0)).toEqual([]);
    expect(fireballsNear(null, Date.now(), 0, 0)).toEqual([]);
  });
});

describe('sizes and energies', () => {
  it('draws a bigger event bigger, within limits', () => {
    expect(fireballSize(0.05)).toBeLessThan(fireballSize(5));
    expect(fireballSize(441)).toBe(30);
    expect(fireballSize(1e9)).toBe(32);
    expect(fireballSize(null)).toBeGreaterThanOrEqual(10);
  });

  it('says tons below a kiloton and kilotons above', () => {
    expect(describeEnergy(0.13)).toEqual({ value: 130, unit: 't' });
    expect(describeEnergy(441)).toEqual({ value: 441, unit: 'kt' });
    expect(describeEnergy(null)).toBeNull();
  });
});

describe('the sighting checker', () => {
  const when = new Date('2013-02-15T03:30:00Z');
  const sky = skyAt(56, 63, when, { minAlt: 0 });
  const [ball] = fireballsNear(rows, when, 56, 63, { hours: 2 });
  const rank = (motion, fireballs) => rankCandidates({ report: { motion }, sky, fireballs }).find((c) => c.kind === 'fireball');

  it('offers the fireball as a strong match for a fast light seen minutes before, and weakly for a light that stood still', () => {
    expect(rank('fast', [ball]).score).toBeGreaterThan(0.6);
    expect(rank('still', [ball]).score).toBeLessThan(0.15);
    expect(rank('fast', [ball]).reason).toMatch(/before your sighting/);
  });

  it('offers nothing when no fireball was recorded', () => {
    expect(rank('fast', [])).toBeUndefined();
    expect(rank('fast', null)).toBeUndefined();
  });
});

describe('the builder', () => {
  const response = (data) => ({ fields: ['date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel'], data });

  it('turns the API rows into compact events, oldest first, with the sign of the hemispheres', () => {
    const events = pack(response([
      ['2020-01-02 03:04:05', '1.5', '0.05', '41.8', 'S', '173.1', 'W', '26.9', '13.8'],
      ['2019-01-01 00:00:00', '3', '0.1', '10', 'N', '20', 'E', null, null],
    ]));
    expect(events).toEqual([
      [Date.UTC(2019, 0, 1) / 1000, 10, 20, 3, 0.1, null, null],
      [Date.UTC(2020, 0, 2, 3, 4, 5) / 1000, -41.8, -173.1, 1.5, 0.05, 26.9, 13.8],
    ]);
  });

  it('drops rows without a position and refuses an empty or foreign answer', () => {
    expect(pack(response([['2020-01-02 03:04:05', '1', '1', null, null, null, null, null, null], ['2020-01-03 00:00:00', '1', '1', '1', 'N', '1', 'E', null, null]]))).toHaveLength(1);
    expect(() => pack(response([]))).toThrow(/No fireballs/);
    expect(() => pack({ error: 'nope' })).toThrow(/Not a fireball/);
    expect(() => pack({ fields: ['date'], data: [] })).toThrow(/column/);
  });
});
