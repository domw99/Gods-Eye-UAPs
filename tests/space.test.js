import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SPACE, SPACE_ZONES } from '../src/data/space.js';
import { STATUS } from '../src/data/taxonomy.js';
import { moonXY } from '../src/ui/space.js';

const official = JSON.parse(readFileSync(new URL('../public/data/official-uap-media.json', import.meta.url), 'utf8'));
const dvidsIds = new Set(official.items.map((i) => Number(i.dvidsId)));

describe('Space & Moon entries', () => {
  it('has unique ids and every zone in use', () => {
    const ids = SPACE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const z of SPACE_ZONES) expect(SPACE.some((e) => e.zone === z), z).toBe(true);
  });

  for (const e of SPACE) {
    describe(e.id, () => {
      it('is well formed', () => {
        expect(SPACE_ZONES).toContain(e.zone);
        expect(Object.keys(STATUS)).toContain(e.status);
        expect(Number.isInteger(e.year)).toBe(true);
        expect(e.title).toBeTruthy();
        expect(e.when).toBeTruthy();
        expect(e.summary.length).toBeGreaterThan(120);
        expect(e.explanation.length).toBeGreaterThan(30);
        expect(e.sources.length).toBeGreaterThan(0);
        for (const s of e.sources) expect(s.url).toMatch(/^https?:\/\//);
      });

      it('points only at real official files and real places', () => {
        for (const id of e.official || []) expect(dvidsIds.has(id), `DVIDS ${id}`).toBe(true);
        if (e.earth) {
          expect(Math.abs(e.earth.lat)).toBeLessThanOrEqual(90);
          expect(Math.abs(e.earth.lon)).toBeLessThanOrEqual(180);
          expect(e.earth.note).toBeTruthy();
        }
        for (const m of e.moon || []) {
          expect(Math.abs(m.lat)).toBeLessThanOrEqual(90);
          expect(Math.abs(m.lon)).toBeLessThanOrEqual(180);
          expect(m.label).toBeTruthy();
          expect(moonXY(m.lat, m.lon), `${m.label} is on the near side`).not.toBeNull();
        }
        if (e.zone !== 'moon') expect(e.moon).toBeUndefined();
      });
    });
  }
});

describe('Moon picture', () => {
  it('puts known craters where the photograph shows them', () => {
    // Positions measured on the photograph (fractions of its width).
    const known = { Tycho: [-43.31, -11.36, 0.3734, 0.7656], Copernicus: [9.62, -20.08, 0.4029, 0.3366], Aristarchus: [23.73, -47.49, 0.2656, 0.1966], 'Mare Crisium': [17, 59.1, 0.9377, 0.4534] };
    for (const [name, [lat, lon, x, y]] of Object.entries(known)) {
      const at = moonXY(lat, lon);
      expect(Math.abs(at.x - x), `${name} x`).toBeLessThan(0.015);
      expect(Math.abs(at.y - y), `${name} y`).toBeLessThan(0.015);
    }
  });

  it('keeps the middle of the disk near the middle of the picture, and leaves out the far side', () => {
    const c = moonXY(0, 0);
    expect(Math.abs(c.x - 0.5)).toBeLessThan(0.05);
    expect(Math.abs(c.y - 0.5)).toBeLessThan(0.05);
    expect(moonXY(0, 180)).toBeNull();
    expect(moonXY(35.9, 102.8)).toBeNull(); // Giordano Bruno, just past the limb
  });
});
