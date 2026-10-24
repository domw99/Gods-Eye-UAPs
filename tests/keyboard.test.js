import { describe, it, expect } from 'vitest';
import { revealShift } from '../src/app/keyboard.js';

// A dialog's scroll box from 100 to 800; the keyboard leaves the top 500px of the screen visible.
const box = { top: 100, bottom: 800 };
const view = { top: 0, bottom: 500 };

describe('keeping a focused field above the on-screen keyboard', () => {
  it('leaves a field that already shows where it is', () => {
    expect(revealShift({ top: 200, bottom: 240 }, box, view)).toBe(0);
  });
  it('scrolls a field under the keyboard up to just above it', () => {
    expect(revealShift({ top: 600, bottom: 644 }, box, view)).toBe(644 - (500 - 12));
  });
  it('scrolls a field above the top of the box back down into it', () => {
    expect(revealShift({ top: 60, bottom: 100 }, box, view)).toBe(60 - (100 + 12));
  });
  it('keeps the top of a field taller than the room left in view', () => {
    expect(revealShift({ top: 300, bottom: 900 }, box, view)).toBe(300 - 112);
  });
});
