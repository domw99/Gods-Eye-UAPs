import { describe, it, expect } from 'vitest';
import { lonLatToTile, tileBounds, buildingHeights, wantedTiles } from '../src/layers/buildings.js';

describe('OSM building tiles', () => {
  it('finds the z14 tile for a point and its bounds contain it', () => {
    const cases = [
      [-73.9857, 40.7484], // Empire State Building
      [-0.1276, 51.5072], // London
      [151.2093, -33.8688], // Sydney
      [-58.3816, -34.6037], // Buenos Aires
    ];
    for (const [lon, lat] of cases) {
      const { x, y } = lonLatToTile(lon, lat);
      const b = tileBounds(x, y);
      expect(lon).toBeGreaterThanOrEqual(b.west);
      expect(lon).toBeLessThan(b.east);
      expect(lat).toBeLessThanOrEqual(b.north);
      expect(lat).toBeGreaterThan(b.south);
    }
  });

  it('matches the standard slippy-map numbering', () => {
    expect(lonLatToTile(-73.9857, 40.7484)).toEqual({ x: 4824, y: 6157 });
  });

  it('derives heights with sane defaults', () => {
    expect(buildingHeights({ render_height: 30, render_min_height: 10 })).toEqual({ base: 10, top: 30 });
    expect(buildingHeights({})).toEqual({ base: 0, top: 6 });
    expect(buildingHeights({ render_height: 5, render_min_height: 8 })).toEqual({ base: 8, top: 9 });
    expect(buildingHeights({ render_height: 5000 }).top).toBe(900);
  });

  it('wraps the tile columns at the antimeridian and skips rows past the poles', () => {
    const n = 2 ** 14;
    const east = wantedTiles({ x: n - 1, y: 100 }, 1);
    expect(east.map((t) => t.x).sort((a, b) => a - b)).toEqual([0, 0, 0, n - 2, n - 2, n - 2, n - 1, n - 1, n - 1]);
    const west = wantedTiles({ x: 0, y: 100 }, 1);
    expect(west.every((t) => t.x >= 0 && t.x < n)).toBe(true);
    expect(west.some((t) => t.x === n - 1)).toBe(true);
    const pole = wantedTiles({ x: 5, y: 0 }, 2);
    expect(pole.every((t) => t.y >= 0)).toBe(true);
    expect(pole).toHaveLength(15);
    expect(wantedTiles({ x: 5, y: 7 }, 1)[0]).toMatchObject({ x: 5, y: 7, d2: 0 });
    // The tile across the line is the neighbour: its bounds start at the antimeridian.
    expect(tileBounds(0).west).toBe(-180);
    expect(tileBounds(n - 1).east).toBe(180);
  });
});
