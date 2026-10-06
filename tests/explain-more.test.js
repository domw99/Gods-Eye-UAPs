import { describe, it, expect } from 'vitest';
import { rankCandidates } from '../src/services/explain.js';
import { auroraChance } from '../src/services/geomagnetic.js';

const dark = { sun: { alt: -25, az: 0 }, bodies: [] };
const field = (km, extra = {}) => ({ name: 'Minot Air Force Base', code: 'KMIB', size: 1, military: true, km, bearing: 90, ...extra });
const best = (r, kind) => r.find((c) => c.kind === kind);

describe('aircraft near an airfield', () => {
  const report = { motion: 'steady', blinking: true };

  it('is likelier close to an airfield than where none was checked or none was near', () => {
    const near = best(rankCandidates({ report, sky: dark, airfields: [field(6)] }), 'aircraft');
    const unchecked = best(rankCandidates({ report, sky: dark }), 'aircraft');
    const none = best(rankCandidates({ report, sky: dark, airfields: [] }), 'aircraft');
    expect(near.score).toBeGreaterThan(unchecked.score);
    expect(unchecked.score).toBeGreaterThan(none.score);
    expect(near.name).toBe('Aircraft from Minot Air Force Base');
    expect(near.reason).toMatch(/KMIB\) is 6 km E of you and is a military field/);
    expect(unchecked.name).toBe('Aircraft or drone (not checked)');
    expect(none.name).toBe('Aircraft or drone');
    expect(none.reason).toMatch(/No airport or airfield within 40 km/);
  });

  it('counts a field 30 km away for less than one 6 km away, and a field too far away for nothing', () => {
    const close = best(rankCandidates({ report, sky: dark, airfields: [field(6)] }), 'aircraft').score;
    const far = best(rankCandidates({ report, sky: dark, airfields: [field(30)] }), 'aircraft').score;
    const tooFar = best(rankCandidates({ report, sky: dark, airfields: [field(70)] }), 'aircraft');
    expect(close).toBeGreaterThan(far);
    expect(tooFar.name).toBe('Aircraft or drone');
  });

  it('counts a small airfield for less than a large one at the same distance', () => {
    const big = best(rankCandidates({ report, sky: dark, airfields: [field(30, { size: 0 })] }), 'aircraft');
    const small = best(rankCandidates({ report, sky: dark, airfields: [field(30, { size: 2 })] }), 'aircraft');
    expect(big.name).toMatch(/^Aircraft from/);
    expect(small.name).toBe('Aircraft or drone');
  });
});

describe('aurora', () => {
  const london = auroraChance(27, 51.5, -0.12); // the storm of March 1989
  const roswell = auroraChance(27, 33.4, -104.5);
  const report = { motion: 'still', colours: true };

  it('is offered, and ranks high, for a still coloured glow in a dark sky inside the oval', () => {
    const r = rankCandidates({ report, sky: dark, aurora: { ...london, thirds: 27 } });
    expect(r[0].kind).toBe('aurora');
    expect(r[0].name).toBe('Aurora (Kp 9o)');
    expect(r[0].reason).toMatch(/extreme storm \(G5\)/);
    expect(r[0].reason).toMatch(/could have been overhead/);
  });

  it('is not offered in daylight, where the aurora cannot be seen, or from far from the oval', () => {
    expect(best(rankCandidates({ report, sky: { sun: { alt: -5, az: 0 }, bodies: [] }, aurora: { ...london, thirds: 27 } }), 'aurora')).toBeUndefined();
    expect(best(rankCandidates({ report, sky: dark, aurora: { ...auroraChance(15, 27.9, -81.8), thirds: 15 } }), 'aurora')).toBeUndefined();
    expect(best(rankCandidates({ report, sky: dark }), 'aurora')).toBeUndefined();
  });

  it('is only a glow low on the horizon just outside the oval, toward the pole', () => {
    const low = rankCandidates({ report: { ...report, az: 0, alt: 10 }, sky: dark, aurora: { ...roswell, thirds: 27 } });
    expect(best(low, 'aurora').reason).toMatch(/glow low on the north horizon/);
    const wrongWay = rankCandidates({ report: { ...report, az: 180, alt: 10 }, sky: dark, aurora: { ...roswell, thirds: 27 } });
    const high = rankCandidates({ report: { ...report, az: 0, alt: 70 }, sky: dark, aurora: { ...roswell, thirds: 27 } });
    expect(best(wrongWay, 'aurora').score).toBeLessThan(best(low, 'aurora').score);
    expect(best(high, 'aurora').score).toBeLessThan(best(low, 'aurora').score);
  });

  it('is less likely for something that moved fast', () => {
    const still = best(rankCandidates({ report: { motion: 'still' }, sky: dark, aurora: { ...london, thirds: 27 } }), 'aurora').score;
    const fast = best(rankCandidates({ report: { motion: 'fast' }, sky: dark, aurora: { ...london, thirds: 27 } }), 'aurora').score;
    expect(fast).toBeLessThan(still / 2);
  });
});
