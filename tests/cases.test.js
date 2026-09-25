import { describe, it, expect } from 'vitest';
import { CASES } from '../src/data/cases/index.js';
import { EVIDENCE, STATUS, CATEGORY, TRACK_KINDS, TRACK_BASIS, PRECISION } from '../src/data/taxonomy.js';
import { trackStats } from '../src/layers/tracks.js';
import { haversineKm } from '../src/util/geo.js';

describe('curated case files', () => {
  it('has unique ids', () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const c of CASES) {
    describe(c.id, () => {
      it('has required, well-formed fields', () => {
        expect(c.title).toBeTruthy();
        expect(c.summary.length).toBeGreaterThan(60);
        expect(Number.isNaN(Date.parse(c.date))).toBe(false);
        expect(c.date).toMatch(/[+-]\d{2}:\d{2}$/); // local offset recorded
        if (c.end) expect(Date.parse(c.end)).toBeGreaterThanOrEqual(Date.parse(c.date));
        expect(c.lat).toBeGreaterThanOrEqual(-90);
        expect(c.lat).toBeLessThanOrEqual(90);
        expect(c.lon).toBeGreaterThanOrEqual(-180);
        expect(c.lon).toBeLessThanOrEqual(180);
        expect(Object.keys(PRECISION)).toContain(c.precision);
        expect(Object.keys(STATUS)).toContain(c.status);
        expect(Object.keys(CATEGORY)).toContain(c.category);
        expect(c.evidence.length).toBeGreaterThan(0);
        for (const e of c.evidence) expect(Object.keys(EVIDENCE)).toContain(e);
      });

      it('explains non-unresolved assessments', () => {
        if (c.status !== 'unresolved') expect(c.explanation?.length).toBeGreaterThan(20);
      });

      it('references media in a known form', () => {
        for (const m of c.media || []) {
          const kinds = ['commons', 'dvids', 'ia'].filter((k) => m[k]);
          expect(kinds.length).toBe(1);
          if (m.commons) expect(m.commons).toMatch(/^File:.+\.\w{3,4}$/);
          if (m.dvids) expect(m.dvids).toMatch(/^\d{5,8}$/);
        }
        for (const s of c.sources || []) expect(s.url).toMatch(/^https?:\/\//);
      });

      for (const t of c.tracks || []) {
        it(`track "${t.label}" is plausible`, () => {
          expect(Object.keys(TRACK_KINDS)).toContain(t.kind);
          expect(Object.keys(TRACK_BASIS)).toContain(t.basis);
          expect(t.points.length).toBeGreaterThanOrEqual(2);
          for (let i = 0; i < t.points.length; i++) {
            const [lon, lat, alt, time] = t.points[i];
            expect(Math.abs(lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(lon)).toBeLessThanOrEqual(180);
            expect(alt).toBeGreaterThanOrEqual(0);
            expect(alt).toBeLessThan(300_000);
            if (i) expect(time).toBeGreaterThanOrEqual(t.points[i - 1][3]); // time never runs backwards
          }
          // Every track stays in the neighbourhood of its case (≤ 3,000 km),
          // except long-haul balloon tracks.
          if (t.kind !== 'balloon')
            for (const [lon, lat] of t.points) expect(haversineKm(c.lat, c.lon, lat, lon)).toBeLessThan(3000);
          const st = trackStats(t);
          expect(st.length).toBeGreaterThanOrEqual(0);
        });
      }
    });
  }
});
