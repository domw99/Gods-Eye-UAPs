import { describe, it, expect } from 'vitest';
import { lonLatToTile, tileBounds, buildingHeights } from '../src/layers/buildings.js';

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
});
