import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rowScroll } from '../src/app/listbox.js';

// A list's scroll box from 150 to 800.
const box = { top: 150, bottom: 800 };

describe('bringing the open record’s row into view', () => {
  it('leaves a row that already shows whole, so a click does not move the list', () => {
    expect(rowScroll({ top: 300, bottom: 390 }, box)).toBe(null);
  });
  it('nudges a row cut off at either edge just into view', () => {
    expect(rowScroll({ top: 740, bottom: 830 }, box)).toBe('nearest');
    expect(rowScroll({ top: 120, bottom: 210 }, box)).toBe('nearest');
  });
  it('centres a row that is out of sight, so it stays in view if the rows above it shift', () => {
    expect(rowScroll({ top: 22000, bottom: 22090 }, box)).toBe('center');
    expect(rowScroll({ top: -400, bottom: -310 }, box)).toBe('center');
  });
});

describe('the lists are one Tab stop each', () => {
  // Hundreds of rows, each its own Tab stop, kept the keyboard from everything after the list.
  for (const file of ['src/ui/list.js', 'src/ui/moonview.js']) {
    it(`${file} renders its rows out of the Tab order and gives the list a single stop`, () => {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/role="option" tabindex="0"/);
      expect(src).toMatch(/role="option" tabindex="-1"/);
      expect(src).toMatch(/\brove\(/);
      expect(src).toMatch(/bindListbox\(/);
    });
  }
});
