import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CASES } from '../src/data/cases/index.js';

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** A number below 100 in words, capitalised, as KNOWN-ISSUES.md writes them ("Fifty-two"). */
const words = (n) => {
  const w = n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
  return w[0].toUpperCase() + w.slice(1);
};

describe('the numbers the known-issues page quotes', () => {
  const text = readFileSync('docs/KNOWN-ISSUES.md', 'utf8');

  it('say how many cases draw a flight path', () => {
    expect(text).toContain(`${words(CASES.filter((c) => c.tracks?.length).length)} cases draw one`);
  });

  it('say how many cases have an approximate time of day', () => {
    expect(text).toContain(`${words(CASES.filter((c) => c.timeApprox).length)} older cases record only a date or part of a day`);
  });
});
