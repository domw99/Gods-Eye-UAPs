import { describe, it, expect } from 'vitest';
import { wrapText } from '../src/ui/sharecard.js';

// Ten pixels a letter, twenty for a Japanese or Chinese character.
const measure = (s) => [...s].reduce((n, ch) => n + (/[　-鿿]/.test(ch) ? 20 : 10), 0);

describe('share card text wrapping', () => {
  it('wraps at spaces and cuts with an ellipsis when there is no room', () => {
    expect(wrapText(measure, 'one two three four', 80, 3)).toEqual(['one two', 'three', 'four']);
    const cut = wrapText(measure, 'one two three four five six', 80, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1]).toMatch(/…$/);
    expect(measure(cut[1])).toBeLessThanOrEqual(80);
  });

  it('breaks a word wider than the line, so a long address stays on the card', () => {
    const lines = wrapText(measure, `see https://example.com/${'a'.repeat(40)} now`, 200, 5);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(200);
    expect(lines.join('').replace(/\s/g, '')).toBe(`seehttps://example.com/${'a'.repeat(40)}now`);
  });

  it('wraps Japanese and Chinese text, which has no spaces', () => {
    const text = '木星の近くに三つの明るい光が静かに並んで見えたが数分後に消えた'.repeat(2);
    const lines = wrapText(measure, text, 200, 8);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(200);
    expect(lines.join('')).toBe(text);
  });

  it('gives nothing for empty text and ends with an ellipsis for endless text', () => {
    expect(wrapText(measure, '   ', 200, 3)).toEqual([]);
    const lines = wrapText(measure, 'あ'.repeat(500), 200, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });
});
