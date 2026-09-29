import { describe, it, expect } from 'vitest';
import { clusterLevel, groupByDistance } from '../src/layers/items.js';

const at = (x, y = 0, z = 0) => ({ x, y, z });

describe('marker grouping', () => {
  it('keeps its zoom step until the camera is clearly in another', () => {
    const l = clusterLevel(10_000_000);
    expect(clusterLevel(10_000_000, l)).toBe(l);
    // Small moves around the boundary between two steps don't switch back and forth.
    expect(clusterLevel(10_000_000 * 1.4 ** 0.55, l)).toBe(l);
    expect(clusterLevel(10_000_000 / 1.4 ** 0.55, l)).toBe(l);
    // Well past it, the step changes.
    expect(clusterLevel(10_000_000 * 1.4 ** 1.2, l)).toBe(l + 1);
    expect(clusterLevel(10_000_000 / 1.4 ** 1.2, l)).toBe(l - 1);
  });

  it('groups three or more close points and leaves pairs and loners alone', () => {
    const pts = [at(0), at(50), at(90), at(10_000), at(10_040), at(50_000)];
    const groups = groupByDistance(pts, 100);
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual([0, 1, 2]);
  });

  it('gives the same groups however the points are listed, shifted or rotated with the globe', () => {
    const pts = [at(0), at(60), at(30, 40), at(5_000), at(5_050), at(5_020, 30), at(9_000)];
    const key = (gs, map = (i) => i) => gs.map((g) => g.map(map).sort((a, b) => a - b).join(',')).sort();
    const base = key(groupByDistance(pts, 100));
    // Moving every point together (what turning the camera does on screen) changes nothing.
    const shifted = pts.map((p) => at(p.x + 12_345, p.y - 777, p.z + 31));
    expect(key(groupByDistance(shifted, 100))).toEqual(base);
    expect(base).toEqual(['0,1,2', '3,4,5']);
  });

  it('merges groups whose centres are close', () => {
    // The first group takes 0, 95 and 99; 105–115 start a second group only 45 m away.
    const pts = [at(0), at(95), at(99), at(105), at(110), at(115)];
    const groups = groupByDistance(pts, 100);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(6);
  });
});
