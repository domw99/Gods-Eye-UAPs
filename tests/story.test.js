import { describe, it, expect } from 'vitest';
import { CASES } from '../src/data/cases/index.js';
import { buildStory, sentences } from '../src/ui/story.js';

describe('story mode', () => {
  it('names the day it happened where it happened, not the UTC day', () => {
    // 22:30 on 2 July in New Mexico is already 3 July in UTC.
    const c = CASES.find((x) => x.id === 'socorro-zamora-1964');
    const first = buildStory({ ...c, date: '1964-07-02T22:30:00-06:00' })[0].text;
    expect(first).toMatch(/\b2 July 1964/);
    expect(first).not.toMatch(/\b3 July/);
  });

  it('builds a story for every case, with an assessment at the end and no empty captions', () => {
    for (const c of CASES) {
      const steps = buildStory(c);
      expect(steps.length, c.id).toBeGreaterThan(2);
      expect(steps.at(-1).kicker, c.id).toMatch(/^ASSESSMENT/);
      for (const s of steps) {
        expect(s.text.trim().length, `${c.id} ${s.kicker}`).toBeGreaterThan(0);
        expect(s.text, c.id).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  });

  it("does not split sentences at 'U.S.' or initials", () => {
    expect(sentences('A U.S. Navy pilot, Lt. J. Smith, saw it. It moved fast.')).toEqual(['A U.S. Navy pilot, Lt. J. Smith, saw it.', 'It moved fast.']);
  });
});
