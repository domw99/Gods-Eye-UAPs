import { describe, it, expect } from 'vitest';
import * as satellite from 'satellite.js';
import { parseTle, propagatePosition, isSunlit } from '../src/layers/satellites.js';

const ISS = ['ISS (ZARYA)', '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9006', '2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.50000000    19'];
const AT = new Date('2024-01-01T13:00:00Z');

describe('element sets', () => {
  it('reads three-line sets, whatever the line endings and blank lines', () => {
    const two = [...ISS, 'OTHER', ISS[1].replace('25544', '25545'), ISS[2].replace('25544', '25545')];
    const sets = parseTle(`${two.join('\r\n')}\r\n\r\n`);
    expect(sets.map((s) => [s.name, s.norad])).toEqual([['ISS (ZARYA)', '25544'], ['OTHER', '25545']]);
    expect(parseTle('No GP data found')).toEqual([]);
    expect(parseTle('')).toEqual([]);
  });

  it('puts a healthy satellite in orbit', () => {
    const [sat] = parseTle(ISS.join('\n'));
    const pv = propagatePosition(sat.satrec, AT);
    const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z);
    expect(r).toBeGreaterThan(6371 + 300);
    expect(r).toBeLessThan(6371 + 600);
  });

  it('gives no position for a damaged or decayed set, instead of NaN that stops the globe drawing', () => {
    // The epoch garbled: satellite.js still parses it, and propagates to NaN.
    const blank = parseTle([ISS[0], ISS[1].replace('24001.50000000', 'XXXXXXXXXXXXXX'), ISS[2]].join('\n'));
    expect(blank).toHaveLength(1);
    expect(propagatePosition(blank[0].satrec, AT)).toBeNull();
    // A mean motion that has decayed.
    const decayed = parseTle([ISS[0], ISS[1], ISS[2].replace('15.50000000', '99.50000000')].join('\n'));
    expect(propagatePosition(decayed[0].satrec, AT)).toBeNull();
    // An invalid date.
    const [sat] = parseTle(ISS.join('\n'));
    expect(propagatePosition(sat.satrec, new Date(NaN))).toBeNull();
    expect(satellite.propagate(blank[0].satrec, AT).position.x).toBeNaN(); // what the library does, which is why
  });
});

describe('Earth shadow', () => {
  const sun = { x: 1, y: 0, z: 0 };
  it('lights a satellite on the day side or off to the side of the shadow cylinder', () => {
    expect(isSunlit({ x: 7000, y: 0, z: 0 }, sun)).toBe(true);
    expect(isSunlit({ x: -7000, y: 7000, z: 0 }, sun)).toBe(true);
    expect(isSunlit({ x: -100, y: 0, z: 6372 }, sun)).toBe(true);
  });
  it('puts a satellite behind the Earth in the shadow', () => {
    expect(isSunlit({ x: -7000, y: 0, z: 0 }, sun)).toBe(false);
    expect(isSunlit({ x: -100, y: 6000, z: 1000 }, sun)).toBe(false);
  });
});
