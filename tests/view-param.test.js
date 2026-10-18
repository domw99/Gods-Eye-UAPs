import { describe, it, expect } from 'vitest';
import { parseView } from '../src/app/links.js';

describe('?view= links', () => {
  it('reads a camera, with heading and pitch optional', () => {
    expect(parseView('-45.0000,28.0000,17500000,0,-90')).toEqual({ lon: -45, lat: 28, h: 17500000, heading: 0, pitch: -90 });
    expect(parseView('10,20,1000')).toEqual({ lon: 10, lat: 20, h: 1000, heading: 0, pitch: -90 });
    expect(parseView('10,20,1000,abc,xyz')).toEqual({ lon: 10, lat: 20, h: 1000, heading: 0, pitch: -90 });
  });

  it('refuses what is not a place in view of the Earth', () => {
    for (const v of ['', 'garbage', '1,2', '0,0,0', '0,0,-5', '0,91,1000', '0,0,NaN', 'Infinity,0,1000', '181,0,1000'])
      expect(parseView(v), v).toBeNull();
  });

  it('reads a blank part as missing, not as 0', () => {
    expect(parseView('10,,500')).toBeNull();
    expect(parseView(',20,500')).toBeNull();
    expect(parseView('10,20,')).toBeNull();
    expect(parseView('10,20,500,,')).toEqual({ lon: 10, lat: 20, h: 500, heading: 0, pitch: -90 });
  });

  it('refuses a height that makes Cesium throw while the app is starting', () => {
    expect(parseView('0,0,1e300')).toBeNull();
    expect(parseView('0,0,1e10')).toBeNull();
    expect(parseView('0,0,4.2e7')).not.toBeNull();
  });
});

describe('the year range from the keyboard', () => {
  it('moves, widens and clears the range, and starts a ten-year one when there is none', async () => {
    const { keyedRange } = await import('../src/ui/timeline.js');
    const key = (k, extra = {}) => ({ key: k, ...extra });
    expect(keyedRange(key('ArrowRight'), [1990, 1995], 1900, 2030)).toEqual([1991, 1996]);
    expect(keyedRange(key('ArrowLeft'), [1900, 1905], 1900, 2030)).toEqual([1900, 1905]);
    expect(keyedRange(key('ArrowRight'), [2025, 2030], 1900, 2030)).toEqual([2025, 2030]);
    expect(keyedRange(key('ArrowRight', { shiftKey: true }), [1990, 1995], 1900, 2030)).toEqual([1990, 1996]);
    expect(keyedRange(key('ArrowLeft', { shiftKey: true }), [1990, 1990], 1900, 2030)).toEqual([1990, 1990]);
    expect(keyedRange(key('ArrowLeft', { altKey: true }), [1990, 1995], 1900, 2030)).toEqual([1989, 1995]);
    expect(keyedRange(key('PageUp'), [1990, 1995], 1900, 2030)).toEqual([2000, 2005]);
    expect(keyedRange(key('Home'), [1990, 1995], 1900, 2030)).toEqual([1900, 1905]);
    expect(keyedRange(key('End'), [1990, 1995], 1900, 2030)).toEqual([2025, 2030]);
    expect(keyedRange(key('ArrowLeft'), null, 1900, 2030)).toEqual([2021, 2030]);
    expect(keyedRange(key('ArrowRight'), null, 1900, 2030)).toEqual([1900, 1909]);
    expect(keyedRange(key('Escape'), [1990, 1995], 1900, 2030)).toBeNull();
    expect(keyedRange(key('Escape'), null, 1900, 2030)).toBeUndefined(); // Esc with nothing chosen closes the case file as usual
    expect(keyedRange(key('a'), [1990, 1995], 1900, 2030)).toBeUndefined();
  });
});
