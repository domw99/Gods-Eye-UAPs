import { describe, it, expect } from 'vitest';
import { sunAltitude, nightDim } from '../src/services/sky.js';

describe('day and night at the moment of a case', () => {
  it('finds the sun high at local noon and below the horizon at midnight', () => {
    // Equator, Greenwich, near the March equinox.
    expect(sunAltitude(0, 0, '2024-03-20T12:07:00Z')).toBeGreaterThan(85);
    expect(sunAltitude(0, 0, '2024-03-20T00:07:00Z')).toBeLessThan(-85);
  });

  it('puts the Hills’ drive (Sept 1961, 22:30 EDT) in full night', () => {
    expect(sunAltitude(44.2, -71.6, '1961-09-20T02:30:00Z')).toBeLessThan(-18);
  });

  it('dims the ground through twilight to a readable night', () => {
    expect(nightDim(10)).toBe(1);
    expect(nightDim(0)).toBe(1);
    expect(nightDim(-3)).toBeCloseTo(0.875, 3);
    expect(nightDim(-6)).toBeCloseTo(0.75, 3);
    expect(nightDim(-12)).toBeCloseTo(0.6, 3);
    expect(nightDim(-40)).toBeGreaterThan(0.5);
    // Never brightens as the sun sinks.
    let last = 1;
    for (let a = 5; a >= -30; a -= 0.5) {
      expect(nightDim(a)).toBeLessThanOrEqual(last + 1e-9);
      last = nightDim(a);
    }
  });
});
