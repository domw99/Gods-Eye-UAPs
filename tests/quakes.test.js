import { describe, it, expect } from 'vitest';
import { parseQuakes, quakeSize, quakeColor, loadQuakes, QUAKE_FEED } from '../src/services/quakes.js';

const feed = {
  features: [
    { id: 'a', geometry: { coordinates: [-122.1, 37.4, 8.2] }, properties: { mag: 2.1, place: '5 km N of Somewhere, CA', time: 1_700_000_000_000, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/a' } },
    { id: 'b', geometry: { coordinates: [142.4, 38.3, 29] }, properties: { mag: 6.3, place: 'off the coast of Honshu, Japan', time: 1_700_000_100_000, url: 'https://evil.example/b', felt: 1200 } },
    { id: 'c', geometry: { coordinates: [null, 10, 1] }, properties: { mag: 3, time: 1 } }, // no longitude
    { id: 'd', geometry: { coordinates: [10, 10] }, properties: { mag: null, place: 'Somewhere', time: 1_700_000_200_000 } },
  ],
};

describe('earthquake feed', () => {
  it('keeps usable rows, strongest first, and only links to the USGS', () => {
    const rows = parseQuakes(feed);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'd']);
    expect(rows[0]).toMatchObject({ mag: 6.3, depthKm: 29, felt: 1200, url: null }); // a link off the USGS is dropped
    expect(rows[1].url).toMatch(/^https:\/\/earthquake\.usgs\.gov\//);
    expect(rows[2]).toMatchObject({ mag: null, depthKm: null });
    expect(parseQuakes(null)).toEqual([]);
  });

  it('draws bigger quakes bigger and redder, within limits', () => {
    expect(quakeSize(1)).toBeLessThan(quakeSize(5));
    expect(quakeSize(9.5)).toBe(34);
    expect(quakeSize(null)).toBeGreaterThanOrEqual(9);
    expect(quakeColor(2)).not.toBe(quakeColor(6.5));
  });

  it('asks the USGS once and keeps the answer for ten minutes', async () => {
    let calls = 0;
    const fetchImpl = async (url) => {
      calls++;
      expect(url).toBe(QUAKE_FEED);
      return { ok: true, json: async () => feed };
    };
    const t0 = 5_000_000_000_000;
    expect((await loadQuakes(fetchImpl, t0)).length).toBe(3);
    await loadQuakes(fetchImpl, t0 + 9 * 60e3);
    expect(calls).toBe(1);
    await loadQuakes(fetchImpl, t0 + 11 * 60e3);
    expect(calls).toBe(2);
    await expect(loadQuakes(async () => ({ ok: false, status: 503 }), t0 + 30 * 60e3)).rejects.toThrow(/503/);
  });
});
