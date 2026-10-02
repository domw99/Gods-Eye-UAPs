import { describe, it, expect } from 'vitest';
import { CASES } from '../src/data/cases/index.js';
import { similarity, similarCases } from '../src/data/similar.js';

const byId = (id) => CASES.find((c) => c.id === id);

describe('similar cases', () => {
  it('never lists the case itself, and never more than asked for', () => {
    for (const c of CASES) {
      const list = similarCases(c, CASES, 4);
      expect(list.length).toBeLessThanOrEqual(4);
      expect(list.some((d) => d.id === c.id)).toBe(false);
    }
  });

  it('puts the most alike case first', () => {
    const c = byId('rendlesham-1980');
    const list = similarCases(c, CASES, 6);
    const scores = list.map((d) => similarity(c, d));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('is symmetric and gives the same answer every time', () => {
    const a = byId('rendlesham-1980');
    const b = byId('lakenheath-bentwaters-1956');
    expect(similarity(a, b)).toBe(similarity(b, a));
    expect(similarCases(a, CASES).map((d) => d.id)).toEqual(similarCases(a, CASES).map((d) => d.id));
  });

  it('finds something for most cases, so the section is not rare', () => {
    const withMatches = CASES.filter((c) => similarCases(c, CASES).length > 0).length;
    expect(withMatches / CASES.length).toBeGreaterThan(0.85);
  });
});
