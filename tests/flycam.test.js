import { describe, it, expect } from 'vitest';
import { tiltStep } from '../src/app/flycam.js';

const LEVEL = -0.05; // the highest the view may rise: just below the horizon
const DOWN = -Math.PI / 2 + 0.01; // the lowest: just short of straight down

describe('tilting the view with Shift and the arrow keys', () => {
  it('passes a step through while the pitch stays between the limits', () => {
    expect(tiltStep(-0.8, 0.1)).toBeCloseTo(0.1, 12);
    expect(tiltStep(-0.8, -0.1)).toBeCloseTo(-0.1, 12);
  });

  it('never raises the view past the horizon', () => {
    for (const pitch of [-1, -0.5, -0.1, -0.06]) {
      let p = pitch;
      for (let i = 0; i < 100; i++) p += tiltStep(p, 0.1);
      expect(p).toBeCloseTo(LEVEL, 12);
    }
    expect(tiltStep(LEVEL, 0.1)).toBeCloseTo(0, 12);
  });

  it('never lowers the view past straight down, and can always come back from either end', () => {
    let p = -0.8;
    for (let i = 0; i < 100; i++) p += tiltStep(p, -0.1);
    expect(p).toBeCloseTo(DOWN, 12);
    expect(tiltStep(DOWN, -0.1)).toBeCloseTo(0, 12);
    expect(tiltStep(LEVEL, -0.1)).toBeCloseTo(-0.1, 12);
    expect(tiltStep(DOWN, 0.1)).toBeCloseTo(0.1, 12);
  });
});
