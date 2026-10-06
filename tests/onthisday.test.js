import { describe, it, expect } from 'vitest';
import { onThisDay } from '../src/data/onthisday.js';
import { CASES } from '../src/data/cases/index.js';

const sample = [
  { id: 'b', date: '2004-11-14T14:00:00-08:00' },
  { id: 'a', date: '1561-11-14T04:00:00+01:00' },
  { id: 'c', date: '1947-06-24T15:00:00-07:00' },
  { id: 'd', date: '1952-11-14T00:30:00+00:00' },
];

describe('on this day', () => {
  it('finds the cases of today by day and month, oldest first', () => {
    expect(onThisDay(sample, new Date(2026, 10, 14)).map((c) => c.id)).toEqual(['a', 'd', 'b']);
    expect(onThisDay(sample, new Date(2026, 5, 24)).map((c) => c.id)).toEqual(['c']);
    expect(onThisDay(sample, new Date(2026, 0, 1))).toEqual([]);
  });

  it('uses the date where the case happened, not the UTC date', () => {
    // 00:30 on the 14th at +09:00 is the 13th in UTC.
    expect(onThisDay([{ id: 'x', date: '1952-11-14T00:30:00+09:00' }], new Date(2026, 10, 14)).map((c) => c.id)).toEqual(['x']);
  });

  it('has a case for most days of the year in the real list, and never throws on one without a date', () => {
    let days = 0;
    for (let d = 0; d < 366; d++) if (onThisDay(CASES, new Date(2024, 0, 1 + d)).length) days++;
    expect(days).toBeGreaterThan(100);
    expect(onThisDay([{ id: 'n' }], new Date())).toEqual([]);
  });
});
