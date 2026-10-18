import { describe, it, expect } from 'vitest';
import { lonDelta, haversineKm } from '../src/util/geo.js';

describe('longitude differences', () => {
  it('go the short way round the antimeridian', () => {
    expect(lonDelta(179, -179)).toBe(2);
    expect(lonDelta(-179, 179)).toBe(-2);
    expect(lonDelta(-170, 170)).toBe(-20);
    expect(lonDelta(10, 20)).toBe(10);
    expect(lonDelta(5, 5)).toBe(0);
    expect(Math.abs(lonDelta(0, 180))).toBe(180);
  });

  it('agree with the great-circle distance across the line', () => {
    // A degree of longitude on the equator is about 111 km, with or without the seam between.
    expect(haversineKm(0, 179.5, 0, -179.5)).toBeCloseTo(111.2, 0);
    expect(Math.abs(lonDelta(179.5, -179.5)) * 111.2).toBeCloseTo(111.2, 0);
  });
});
