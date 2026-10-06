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

  it('refuses a height that makes Cesium throw while the app is starting', () => {
    expect(parseView('0,0,1e300')).toBeNull();
    expect(parseView('0,0,1e10')).toBeNull();
    expect(parseView('0,0,4.2e7')).not.toBeNull();
  });
});
