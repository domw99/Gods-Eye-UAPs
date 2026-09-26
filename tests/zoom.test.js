import { describe, it, expect } from 'vitest';
import { levelledPitch, smoothstep, nextRange, LEVEL_FROM, LEVEL_AT } from '../src/app/zoom.js';

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

describe('centred zoom-out', () => {
  it('keeps the tilt close to the ground', () => {
    expect(levelledPitch(rad(-35), LEVEL_FROM * 0.5)).toBeCloseTo(rad(-35));
  });

  it('levels the view to straight down high up', () => {
    expect(deg(levelledPitch(rad(-35), LEVEL_AT))).toBeCloseTo(-90);
    expect(deg(levelledPitch(rad(-10), LEVEL_AT * 3))).toBeCloseTo(-90);
  });

  it('levels gradually in between, never past straight down', () => {
    let pitch = rad(-30);
    let range = LEVEL_FROM;
    const seen = [];
    while (range < LEVEL_AT) {
      range = nextRange(range, 1.35);
      pitch = levelledPitch(pitch, range);
      seen.push(deg(pitch));
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 1e-9);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(-90 - 1e-9);
    expect(seen.at(-1)).toBeCloseTo(-90);
  });

  it('eases from 0 to 1', () => {
    expect(smoothstep(0, 10, -1)).toBe(0);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
    expect(smoothstep(0, 10, 11)).toBe(1);
  });

  it('stops at the farthest zoom', () => {
    expect(nextRange(30_000_000, 2)).toBe(40_000_000);
  });
});
