import { describe, it, expect } from 'vitest';
import { toMgrs, fromMgrs, toUtm, fromUtm, utmZone } from '../src/util/mgrs.js';
import { parseCoordinates } from '../src/app/coords.js';

// Checked against the `mgrs` npm package (not a dependency) over 20,000 random points; the last digit can differ by a metre above 73°N.
const KNOWN = [
  ['Big Ben', 51.5007, -0.1246, '30U XC 99567 09427'],
  ['Statue of Liberty', 40.6892, -74.0445, '18T WL 80735 04695'],
  ['Roswell', 33.3943, -104.523, '13S ES 44360 95102'],
  ['Sydney Opera House', -33.8568, 151.2153, '56H LH 34900 52288'],
  ['McMurdo Station', -77.846, 166.668, '58C EU 39198 58258'],
  ['Longyearbyen (Svalbard zone)', 78.2232, 15.6267, '33X WG 14278 83355'],
  ['Bergen (Norway zone)', 60.3913, 5.3221, '32V KN 97353 00648'],
  ['Ushuaia', -54.8019, -68.303, '19F EV 44805 27029'],
  ['Tehran', 35.6892, 51.389, '39S WV 35196 49546'],
  ['Minot AFB', 48.416, -101.358, '14U LU 25528 65224'],
];

describe('MGRS from a latitude and longitude', () => {
  it.each(KNOWN)('%s is %s', (_, lat, lon, mgrs) => {
    expect(toMgrs(lat, lon)).toBe(mgrs);
  });

  it('gives fewer digits for a coarser grid, and none for the square alone', () => {
    expect(toMgrs(33.3943, -104.523, 3)).toBe('13S ES 443 951');
    expect(toMgrs(33.3943, -104.523, 1)).toBe('13S ES 4 9');
    expect(toMgrs(33.3943, -104.523, 0)).toBe('13S ES');
  });

  it('has no grid over the poles', () => {
    expect(toMgrs(85, 10)).toBe('');
    expect(toMgrs(-81, 10)).toBe('');
    expect(toMgrs(NaN, 10)).toBe('');
    expect(toUtm(90, 0)).toBeNull();
  });

  it('puts the Norway and Svalbard exceptions in their own zones', () => {
    expect(utmZone(60, 5)).toBe(32);
    expect(utmZone(60, 2)).toBe(31);
    expect(utmZone(75, 5)).toBe(31);
    expect(utmZone(75, 15)).toBe(33);
    expect(utmZone(75, 25)).toBe(35);
    expect(utmZone(75, 38)).toBe(37);
    expect(utmZone(0, 179.99)).toBe(60);
    expect(utmZone(0, -180)).toBe(1);
  });
});

describe('UTM', () => {
  it('has easting 500,000 on the central meridian and northing 0 on the equator', () => {
    const u = toUtm(0, 3);
    expect(u).toMatchObject({ zone: 31, band: 'N', hemisphere: 'N' });
    expect(u.easting).toBeCloseTo(500000, 3);
    expect(u.northing).toBeCloseTo(0, 3);
    const south = toUtm(-0.0001, 3);
    expect(south.hemisphere).toBe('S');
    expect(south.northing).toBeGreaterThan(9_990_000);
  });

  it('goes there and back to within a millimetre', () => {
    for (const [lat, lon] of [[51.5, -0.12], [-33.9, 151.2], [64.1, -21.9], [-54.8, -68.3], [0.5, 179.5], [83.5, 10]]) {
      const back = fromUtm(toUtm(lat, lon));
      expect(Math.abs(back.lat - lat) * 111320).toBeLessThan(0.002);
      expect(Math.abs(back.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180)).toBeLessThan(0.002);
    }
  });
});

describe('MGRS to a latitude and longitude', () => {
  it.each(KNOWN)('reads %s back to within a metre', (_, lat, lon, mgrs) => {
    const p = fromMgrs(mgrs);
    expect(Math.abs(p.lat - lat) * 111320).toBeLessThan(1);
    expect(Math.abs(p.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180)).toBeLessThan(1);
  });

  it('reads it with no spaces, in lower case, or with the digits run together', () => {
    const want = fromMgrs('13S ES 44360 95102');
    for (const text of ['13SES4436095102', '13s es 44360 95102', ' 13S  ES  4436095102 ', '13SES 44360 95102']) expect(fromMgrs(text), text).toEqual(want);
  });

  it('reads a coarser reference as the middle of its square', () => {
    const square = fromMgrs('13S ES');
    const p = fromMgrs('13S ES 4 9'); // 10 km square at 44 / 95
    expect(Math.abs(p.lat - 33.3943)).toBeLessThan(0.06);
    expect(Math.abs(p.lon + 104.523)).toBeLessThan(0.06);
    expect(Math.abs(square.lat - 33.4)).toBeLessThan(0.5);
  });

  it('puts the row in the right 2,000 km cycle, including at the edges of a band', () => {
    // Points within a few hundred metres of the south edge of a band, away from the central meridian.
    for (const [lat, lon] of [[-31.9852, 120.299], [-47.9782, -161.8978], [-15.9988, 113.99], [-63.9995, 90.9957], [23.9991, 100.6], [55.9995, -3.2]]) {
      const back = fromMgrs(toMgrs(lat, lon));
      expect(Math.abs(back.lat - lat) * 111320, `${lat},${lon}`).toBeLessThan(1);
    }
  });

  it('puts a coarse square that starts below the edge of its band in the right cycle', () => {
    // A 100 km (or 10 km, 1 km) square can start below the band's southern edge and still be in the band: the
    // top of the square decides the cycle. These used to land 2,000 km to the north.
    const metres = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 111320 * Math.cos((b.lat * Math.PI) / 180));
    const places = [[-71.8963, -129.1242, 0], [32.1371, -62.2736, 0], [56.015, 125.1609, 1], [64.0061, 71.1034, 1], [56.0252, 2.9815, 2], [56.0182, 2.7189, 2], [56.01, 1.747, 3]];
    for (const [lat, lon, digits] of places) {
      const text = toMgrs(lat, lon, digits);
      expect(metres(fromMgrs(text), { lat, lon }), text).toBeLessThan((digits ? 10 ** (5 - digits) : 100000) * 0.75);
    }
  });

  it('reads the grid in zone 31 within a couple of kilometres of 56°N, where Norway\'s zone 32 starts at 3°E', () => {
    // The edge of the band was worked out from longitudes that are in zone 32, which put it about a kilometre too far north.
    for (const [lat, lon] of [[56.005, 2.99], [56.003, 2.9], [56.002, 1.0], [56.0252, 2.9815]]) {
      const text = toMgrs(lat, lon);
      const back = fromMgrs(text);
      expect(Math.abs(back.lat - lat) * 111320, text).toBeLessThan(1);
      expect(Math.abs(back.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180), text).toBeLessThan(1);
    }
  });

  it('has no 32X, 34X or 36X: Svalbard\'s wide zones took their place', () => {
    for (const text of ['32X NF 00000 00000', '34X DM 50000 50000', '36X VK 12345 12345']) expect(fromMgrs(text), text).toBeNull();
    expect(fromMgrs('33X WG 14278 83355')).not.toBeNull();
  });

  it('turns down what is not a reference', () => {
    for (const text of ['', 'Roswell', '13S', '13S ES 123', '13S ES 12345 6789', '13I ES 12345 67890', '13S ES 123456 123456', '61S ES 12345 67890', '13S JA 12345 67890', '51.5, -0.12', null, undefined]) expect(fromMgrs(text), String(text)).toBeNull();
  });
});

describe('MGRS in the search box', () => {
  it('is a place', () => {
    const p = parseCoordinates('13S ES 44360 95102');
    expect(p.lat).toBeCloseTo(33.3943, 4);
    expect(p.lon).toBeCloseTo(-104.523, 4);
    expect(parseCoordinates('13SES4436095102')).toEqual(p);
  });

  it('does not turn ordinary searches into places', () => {
    for (const text of ['14 UFO sighting', 'Area 51', '1952 7', 'NU 12 ab']) expect(parseCoordinates(text), text).toBeNull();
  });
});
