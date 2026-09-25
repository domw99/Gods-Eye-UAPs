import { describe, it, expect } from 'vitest';
import { horizonDistance } from '../src/app/horizon.js';

describe('horizon distance (markers depth-tested beyond it)', () => {
  it('matches the geometric horizon from orbit', () => {
    // From 17,500 km up, the horizon is about 23,000 km away.
    expect(horizonDistance(17_500_000) / 1000).toBeCloseTo(23_003, -2);
    // From the ISS (~420 km) it is about 2,350 km.
    expect(horizonDistance(420_000) / 1000).toBeCloseTo(2_350, -1);
  });

  it('never drops below the street-level minimum', () => {
    expect(horizonDistance(0)).toBe(20_000);
    expect(horizonDistance(-50)).toBe(20_000);
    expect(horizonDistance(10)).toBe(20_000);
  });

  it('grows with height', () => {
    let last = 0;
    for (const h of [1e2, 1e4, 1e5, 1e6, 1e7, 4e7]) {
      const d = horizonDistance(h);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
  });
});
