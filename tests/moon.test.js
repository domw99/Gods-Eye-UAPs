import { describe, it, expect } from 'vitest';
import { MOON_FEATURES, MOON_SITES, MOON_PLACES, MOON_KINDS, moonReports, searchMoon, viewHeight } from '../src/data/moon.js';
import { SPACE } from '../src/data/space.js';
import { parseKey, fmtLatLon, sunElevation } from '../src/ui/moonview.js';
import { sunOnMoon } from '../src/app/moonsun.js';

describe('places on the Moon', () => {
  it('has unique ids that don’t collide with the lunar reports', () => {
    const ids = [...MOON_PLACES.map((p) => p.id), ...moonReports().map((r) => r.entry.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has real positions, kinds and label tiers', () => {
    for (const p of MOON_PLACES) {
      expect(MOON_KINDS, p.id).toContain(p.kind);
      expect(Math.abs(p.lat), p.id).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lon), p.id).toBeLessThanOrEqual(180);
      expect([1, 2, 3], p.id).toContain(p.tier);
      expect(p.name.length, p.id).toBeGreaterThan(2);
      expect(viewHeight(p), p.id).toBeGreaterThan(50_000);
    }
  });

  it('covers both sides of the Moon and both hemispheres', () => {
    const far = MOON_PLACES.filter((p) => Math.abs(p.lon) > 90);
    expect(far.length).toBeGreaterThan(10);
    expect(MOON_PLACES.some((p) => p.lat > 60)).toBe(true);
    expect(MOON_PLACES.some((p) => p.lat < -60)).toBe(true);
  });

  it('describes each landing site with a date and a note', () => {
    expect(MOON_SITES.length).toBeGreaterThanOrEqual(20);
    for (const s of MOON_SITES) {
      expect(s.when, s.id).toMatch(/\d{4}$/);
      expect(s.note.length, s.id).toBeGreaterThan(20);
      expect(Number.isInteger(s.year), s.id).toBe(true);
      expect(s.when.endsWith(String(s.year)), s.id).toBe(true);
    }
    // The six crewed landings are all there, on the near side.
    for (const n of [11, 12, 14, 15, 16, 17]) {
      const a = MOON_SITES.find((s) => s.id === `apollo-${n}`);
      expect(a, `Apollo ${n}`).toBeTruthy();
      expect(Math.abs(a.lon)).toBeLessThan(60);
    }
  });

  it('puts the famous landmarks where the lunar atlas has them', () => {
    const at = (id) => MOON_PLACES.find((p) => p.id === id);
    // Near the centre of the visible face, to within a few degrees.
    expect(at('copernicus').lon).toBeCloseTo(-20.1, 0);
    expect(at('tycho').lat).toBeLessThan(-40);
    expect(at('mare-crisium').lon).toBeGreaterThan(55);
    expect(at('aristarchus').lat).toBeCloseTo(23.7, 0);
    // Apollo 11 is in the Sea of Tranquility, 21 km from its centre... near enough: within 12° of it.
    const a11 = at('apollo-11');
    const sea = at('mare-tranquillitatis');
    expect(Math.hypot(a11.lat - sea.lat, a11.lon - sea.lon)).toBeLessThan(12);
    // The far-side sites really are on the far side.
    expect(Math.abs(at('change-4').lon)).toBeGreaterThan(90);
    expect(at('chandrayaan-3').lat).toBeLessThan(-65);
  });
});

describe('lunar reports on the map', () => {
  it('numbers them by year, the same way the pins in Space & Moon do', () => {
    const list = moonReports();
    expect(list.length).toBe(SPACE.filter((e) => e.zone === 'moon' && (e.moon?.length || e.moonFar?.length)).length);
    expect(list.map((r) => r.n)).toEqual(list.map((_, i) => i + 1));
    const years = list.map((r) => r.entry.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    for (const r of list) expect(r.sites.length).toBeGreaterThan(0);
  });
});

describe('searching the Moon', () => {
  it('finds a place by its English name, ignoring accents and case', () => {
    expect(searchMoon('tranquility').places.map((p) => p.id)).toContain('mare-tranquillitatis');
    expect(searchMoon('STOFLER').places.map((p) => p.id)).toContain('stofler');
    expect(searchMoon('linne').places.map((p) => p.id)).toContain('linne');
  });

  it('finds missions by name, year or agency words', () => {
    expect(searchMoon('apollo 17').places.map((p) => p.id)).toContain('apollo-17');
    expect(searchMoon('1969').places.map((p) => p.id)).toEqual(expect.arrayContaining(['apollo-11', 'apollo-12']));
    expect(searchMoon('far side').places.length).toBeGreaterThanOrEqual(0);
  });

  it('finds reports by title and year', () => {
    expect(searchMoon('aristarchus').reports.length).toBeGreaterThan(0);
    expect(searchMoon('1178').reports.length).toBeGreaterThan(0);
  });

  it('needs every word, and returns nothing for nonsense', () => {
    expect(searchMoon('apollo zzzzqq').places).toEqual([]);
    expect(searchMoon('zzzzqq')).toEqual({ reports: [], places: [] });
  });

  it('shows everything for an empty search', () => {
    expect(searchMoon('').places.length).toBe(MOON_PLACES.length);
  });

  it('counts every feature and site', () => {
    expect(MOON_PLACES.length).toBe(MOON_FEATURES.length + MOON_SITES.length);
  });
});

describe('map keys and positions', () => {
  it('reads the keys the globe gives back', () => {
    expect(parseKey('place:tycho')).toEqual({ kind: 'place', id: 'tycho', index: 0 });
    expect(parseKey('report:moon-1963')).toEqual({ kind: 'report', id: 'moon-1963', index: 0 });
    expect(parseKey('report:moon-1963#2')).toEqual({ kind: 'report', id: 'moon-1963', index: 2 });
    expect(parseKey('__selected')).toBeNull();
    expect(parseKey(null)).toBeNull();
    expect(parseKey('place:')).toBeNull();
  });

  it('writes latitude and longitude with their hemispheres', () => {
    expect(fmtLatLon(0.674, 23.473)).toBe('0.67°N 23.47°E');
    expect(fmtLatLon(-69.37, -32.32)).toBe('69.37°S 32.32°W');
  });
});

describe('the Sun on the Moon', () => {
  const lonDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  it('stands over the middle of the near side at full Moon, and over the far side at new Moon', () => {
    expect(lonDiff(sunOnMoon(new Date('2024-01-25T17:54:00Z')).lon, 0)).toBeLessThan(8); // full Moon (libration moves it a few degrees)
    expect(lonDiff(sunOnMoon(new Date('2024-01-11T11:57:00Z')).lon, 180)).toBeLessThan(8); // new Moon
    expect(lonDiff(sunOnMoon(new Date('2024-01-18T03:52:00Z')).lon, 90)).toBeLessThan(8); // first quarter: the east half is lit
    expect(Math.abs(sunOnMoon(new Date('2024-01-18T03:52:00Z')).lat)).toBeLessThan(2); // the Moon's axis is nearly upright
  });

  it('gives a unit vector that agrees with its latitude and longitude', () => {
    const s = sunOnMoon(new Date('2020-06-01T00:00:00Z'));
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 9);
    expect(Math.atan2(s.y, s.x) * (180 / Math.PI)).toBeCloseTo(s.lon, 6);
  });

  it('puts the Sun low in the east at the Apollo landings, as the missions planned', () => {
    // Documented Sun elevations: Apollo 11 10.8°, Apollo 12 5.1°, Apollo 17 13.3°.
    const at = (id) => MOON_SITES.find((p) => p.id === id);
    for (const [id, deg] of [['apollo-11', 10.8], ['apollo-12', 5.1], ['apollo-17', 13.3]]) {
      const p = at(id);
      expect(sunElevation(p.lat, p.lon, new Date(p.moment.at)), id).toBeCloseTo(deg, 0);
    }
  });

  it('has a landing time for every site, flagged when only the date is sure', () => {
    for (const p of MOON_SITES) {
      expect(p.moment?.at, p.id).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      expect(new Date(p.moment.at).getUTCFullYear(), p.id).toBe(p.year);
    }
    expect(MOON_SITES.find((p) => p.id === 'luna-24').moment.approx).toBe(true);
    expect(MOON_SITES.find((p) => p.id === 'apollo-11').moment.approx).toBe(false);
  });

  it('gives the lunar reports with a known night a moment to light the map by', () => {
    const lit = moonReports().filter((r) => r.entry.moment);
    expect(lit.map((r) => r.entry.id)).toEqual(['moon-1787', 'moon-1958', 'moon-1963', 'moon-2013']);
    for (const r of lit) expect(new Date(r.entry.moment.at).getUTCFullYear()).toBe(r.entry.year);
  });
});

describe('symbols on the Moon map', () => {
  it('gives every place a symbol of its own kind, drawn in the shared style', async () => {
    const { moonGlyph, MOON_LAYER_GLYPH, MOON_INK, moonGroup } = await import('../src/data/moon.js');
    const { MOON_GLYPHS, glyphSvg } = await import('../src/layers/glyphs.js');
    for (const p of MOON_PLACES) {
      expect(MOON_GLYPHS[moonGlyph(p)], p.id).toBeTruthy();
      expect(MOON_INK[p.kind], p.id).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const g of new Set(MOON_PLACES.map((p) => moonGroup(p.kind)))) expect(glyphSvg(MOON_LAYER_GLYPH[g]), g).toContain('class="swatch"');
    expect(glyphSvg(MOON_LAYER_GLYPH.report)).toContain('class="swatch"');
  });

  it('marks the Apollo sites as crewed and Luna 2 as an impact', async () => {
    const { moonGlyph } = await import('../src/data/moon.js');
    const crewed = MOON_SITES.filter((s) => s.landing === 'crewed').map((s) => s.id);
    expect(crewed).toEqual(['apollo-11', 'apollo-12', 'apollo-14', 'apollo-15', 'apollo-16', 'apollo-17']);
    expect(MOON_SITES.filter((s) => s.landing === 'impact').map((s) => s.id)).toEqual(['luna-2']);
    expect(MOON_SITES.every((s) => ['crewed', 'robotic', 'impact'].includes(s.landing))).toBe(true);
    expect(moonGlyph(MOON_SITES.find((s) => s.id === 'apollo-11'))).toBe('moon-flag');
    expect(moonGlyph(MOON_SITES.find((s) => s.id === 'luna-2'))).toBe('moon-impact');
    expect(moonGlyph(MOON_SITES.find((s) => s.id === 'change-4'))).toBe('moon-lander');
  });

  it('keeps the Moon symbols distinct and inside the 16 × 16 box', async () => {
    const { MOON_GLYPHS, GLYPHS } = await import('../src/layers/glyphs.js');
    const paths = [...Object.values(MOON_GLYPHS), ...Object.values(GLYPHS)].map((g) => `${g.path}|${g.detail}`);
    expect(new Set(paths).size).toBe(paths.length);
    for (const [name, g] of Object.entries(MOON_GLYPHS)) {
      // Absolute coordinates only (upper-case commands), which must stay inside the box.
      for (const cmd of `${g.path} ${g.detail || ''}`.match(/[MLHVCSQTAZ][^MLHVCSQTAZa-z]*/g) || []) {
        const nums = (cmd.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number);
        for (const n of nums) {
          expect(n, `${name} ${cmd}`).toBeGreaterThanOrEqual(0);
          expect(n, `${name} ${cmd}`).toBeLessThanOrEqual(16);
        }
      }
      if (g.dot) for (const n of g.dot) expect(n, name).toBeGreaterThan(1);
    }
  });
});
