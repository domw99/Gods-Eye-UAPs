import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kpThirds, kpLabel, stormScale, geomagneticLatitude, auroraChance, ovalEdge, KP_START } from '../src/services/geomagnetic.js';
import { pack } from '../scripts/build-kp.mjs';

const data = JSON.parse(readFileSync('public/data/kp.json', 'utf8'));

describe('Kp from the bundled series', () => {
  it('starts on 1 January 1932 and runs to recently, with a value for nearly every interval', () => {
    expect(data.start).toBe('1932-01-01');
    expect(data.values.length).toBeGreaterThan(276_000);
    const missing = [...data.values].filter((c) => c === '.').length;
    expect(missing / data.values.length).toBeLessThan(0.001);
  });

  it('reads the intervals GFZ lists (the first line is Kp 3.333 = 3+, the 2nd 2.667 = 3-)', () => {
    expect(kpThirds(data, Date.UTC(1932, 0, 1, 0))).toBe(10);
    expect(kpThirds(data, Date.UTC(1932, 0, 1, 2, 59))).toBe(10);
    expect(kpThirds(data, Date.UTC(1932, 0, 1, 3))).toBe(8);
  });

  it('knows the great storms: 13 March 1989 (Quebec blackout) and 10 May 2024 (Gannon) reached Kp 9', () => {
    const peak = (y, m, d) => Math.max(...Array.from({ length: 8 }, (_, i) => kpThirds(data, Date.UTC(y, m - 1, d, i * 3))));
    expect(peak(1989, 3, 13)).toBeGreaterThanOrEqual(26);
    expect(peak(2024, 5, 10)).toBeGreaterThanOrEqual(26);
    expect(peak(1989, 3, 5)).toBeLessThan(peak(1989, 3, 13));
  });

  it('gives nothing before 1932, after the data, or for nonsense', () => {
    expect(kpThirds(data, Date.UTC(1931, 11, 31))).toBeNull();
    expect(kpThirds(data, Date.UTC(1561, 3, 14))).toBeNull();
    expect(kpThirds(data, Date.UTC(2100, 0, 1))).toBeNull();
    expect(kpThirds(data, 'not a date')).toBeNull();
    expect(kpThirds(null, Date.UTC(2000, 0, 1))).toBeNull();
    expect(KP_START).toBe(Date.UTC(1932, 0, 1));
  });
});

describe('writing and scaling Kp', () => {
  it('writes Kp the way the index is written', () => {
    expect([0, 1, 2, 3, 14, 15, 16, 27].map(kpLabel)).toEqual(['0o', '0+', '1-', '1o', '5-', '5o', '5+', '9o']);
  });

  it('follows NOAA\'s storm scale: G1 at Kp 5 (5- to 5+), G4 includes 9-, G5 is 9o', () => {
    expect([13, 14, 16, 17, 19, 20, 22, 23, 26, 27].map(stormScale)).toEqual([null, 'G1', 'G1', 'G2', 'G2', 'G3', 'G3', 'G4', 'G4', 'G5']);
    expect(stormScale(null)).toBeNull();
  });
});

describe('the aurora', () => {
  it('gets the geomagnetic latitude about right (centred dipole)', () => {
    expect(geomagneticLatitude(80.7, -72.7)).toBeCloseTo(90, 0);
    expect(geomagneticLatitude(51.5, -0.12)).toBeGreaterThan(53);
    expect(geomagneticLatitude(51.5, -0.12)).toBeLessThan(57);
    expect(geomagneticLatitude(33.4, -104.5)).toBeGreaterThan(40);
    expect(geomagneticLatitude(33.4, -104.5)).toBeLessThan(45);
    expect(geomagneticLatitude(-33.9, 151.2)).toBeLessThan(-35);
  });

  it('puts the edge of the oval near 66° at Kp 0 and 48° at Kp 9', () => {
    expect(ovalEdge(0)).toBeCloseTo(66.5, 1);
    expect(ovalEdge(9)).toBeCloseTo(48.1, 0);
  });

  it('says whether it could have been seen: overhead inside the oval, low on the horizon just outside, no from far south', () => {
    // London, in the March 1989 storm (Kp 9): the oval reaches 48° and London is at about 54° geomagnetic.
    expect(auroraChance(27, 51.5, -0.12).chance).toBe('overhead');
    // London on a quiet night.
    expect(auroraChance(3, 51.5, -0.12).chance).toBe('no');
    // New Mexico (about 42° geomagnetic) in a Kp 9 storm: below the oval but within a horizon glow.
    expect(auroraChance(27, 33.4, -104.5).chance).toBe('horizon');
    // Florida in a minor storm.
    expect(auroraChance(15, 27.9, -81.8).chance).toBe('no');
    // Both hemispheres count.
    expect(auroraChance(27, -46.4, 168.4).chance).toBe('overhead'); // Invercargill
    expect(auroraChance(null, 51.5, -0.12)).toBeNull();
  });
});

describe('the Kp builder', () => {
  const line = (days, kp) => `1932 01 01 00.0 01.50 ${days.toFixed(5)} 0.06250 ${kp.toFixed(3)}   18 1`;

  it('packs Kp in thirds, one character per interval, and marks missing values', () => {
    expect(pack(['# comment', line(0, 3.333), line(0.125, 2.667), line(0.25, -1), line(0.375, 9)].join('\n'))).toBe('a8.r');
  });

  it('refuses a file that skips an interval', () => {
    expect(() => pack([line(0, 3), line(0.25, 3)].join('\n'))).toThrow(/skips/);
  });

  it('refuses a file with no Kp lines, so an error page cannot empty the series', () => {
    expect(() => pack('')).toThrow(/No Kp lines/);
    expect(() => pack('# only a comment\n\n')).toThrow(/No Kp lines/);
  });
});
