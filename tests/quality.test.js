import { describe, it, expect } from 'vitest';
import { heartbeatDue } from '../src/app/quality.js';

describe('idle heartbeat (catches changes that did not ask for a frame)', () => {
  it('beats every time while something happened recently', () => {
    for (let tick = 1; tick <= 12; tick++) expect(heartbeatDue(tick, 2_000)).toBe(true);
  });

  it('slows to one beat in four on a globe left still', () => {
    const beats = Array.from({ length: 12 }, (_, i) => heartbeatDue(i + 1, 60_000)).filter(Boolean);
    expect(beats).toHaveLength(3);
  });

  it('never stops beating altogether', () => {
    let longestGap = 0;
    let gap = 0;
    for (let tick = 1; tick <= 100; tick++) {
      gap = heartbeatDue(tick, 3_600_000) ? 0 : gap + 1;
      longestGap = Math.max(longestGap, gap);
    }
    expect(longestGap).toBeLessThanOrEqual(3); // at 500 ms a tick: a frame at least every 2 s
  });
});
