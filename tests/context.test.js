import { describe, it, expect } from 'vitest';
import { skyAt, bodiesNamedIn, compass, daylight } from '../src/services/sky.js';
import { slimLaunch } from '../src/services/launches.js';
import { groupByPad, relativeTime } from '../src/layers/launches.js';
import { evidenceScore } from '../src/data/taxonomy.js';
import { CASES } from '../src/data/cases/index.js';

const find = (sky, name) => sky.bodies.find((b) => b.name === name);

describe('sky at the time', () => {
  it('puts the setting Moon low in the west for the first White Sands patrol (Blue Book: Moon)', () => {
    const c = CASES.find((x) => x.id === 'white-sands-patrols-1957');
    const sky = skyAt(c.lat, c.lon, c.date);
    const moon = find(sky, 'Moon');
    expect(sky.light).toBe('Night');
    expect(moon.alt).toBeGreaterThan(0);
    expect(moon.alt).toBeLessThan(10);
    expect(compass(moon.az)).toMatch(/^W/);
  });

  it('has Jupiter up in the south-west near the Moon for the Hills (as Betty described)', () => {
    const c = CASES.find((x) => x.id === 'hill-abduction-1961');
    const sky = skyAt(44.4889, -71.5692, c.date);
    const jupiter = find(sky, 'Jupiter');
    const moon = find(sky, 'Moon');
    expect(jupiter.alt).toBeGreaterThan(10);
    expect(compass(jupiter.az)).toMatch(/^S/);
    expect(Math.abs(jupiter.az - moon.az)).toBeLessThan(25);
  });

  it('finds bodies named in explanations', () => {
    expect([...bodiesNamedIn('probably the planet Venus and the star Sirius')].sort()).toEqual(['Sirius', 'Venus']);
    expect(bodiesNamedIn('marsh gas').size).toBe(0);
  });

  it('classifies daylight and twilight', () => {
    expect(daylight(10)).toBe('Daylight');
    expect(daylight(-3)).toBe('Civil twilight');
    expect(daylight(-20)).toBe('Night');
  });

  it('computes a sky for every case without throwing', () => {
    for (const c of CASES) {
      const sky = skyAt(c.lat, c.lon, c.date);
      expect(Number.isFinite(sky.sun.alt)).toBe(true);
    }
  });
});

describe('launches', () => {
  const raw = {
    id: 'x',
    name: 'Falcon 9 Block 5 | Starlink Group 5-3',
    net: '2023-02-02T07:58:20Z',
    status: { abbrev: 'Success', name: 'Launch Successful' },
    rocket: { configuration: { full_name: 'Falcon 9 Block 5' } },
    mission: { name: 'Starlink Group 5-3', orbit: { abbrev: 'LEO' } },
    pad: { name: 'Launch Complex 39A', latitude: '28.608', longitude: '-80.604', location: { name: 'Kennedy Space Center, FL, USA' } },
  };
  it('slims Launch Library records', () => {
    const l = slimLaunch(raw);
    expect(l.lat).toBeCloseTo(28.608);
    expect(l.orbit).toBe('LEO');
    expect(l.location).toMatch(/Kennedy/);
  });
  it('groups launches by pad with next and last', () => {
    const now = Date.parse('2023-02-03T00:00:00Z');
    const pads = groupByPad([slimLaunch(raw), slimLaunch({ ...raw, id: 'y', net: '2023-02-10T00:00:00Z' })], now);
    expect(pads).toHaveLength(1);
    expect(pads[0].last.id).toBe('x');
    expect(pads[0].next.id).toBe('y');
  });
  it('formats relative times', () => {
    const now = Date.parse('2023-02-03T00:00:00Z');
    expect(relativeTime('2023-02-03T02:00:00Z', now)).toBe('in 2 h');
    expect(relativeTime('2023-01-30T00:00:00Z', now)).toBe('4 days ago');
  });
});

describe('evidence score', () => {
  it('ranks instrument cases above single-witness ones and stays in 0–10', () => {
    expect(evidenceScore(['radar', 'video', 'pilot-witness', 'military-witness', 'official-document'], true)).toBeGreaterThan(
      evidenceScore(['multiple-witnesses']),
    );
    for (const c of CASES) {
      const s = evidenceScore(c.evidence, (c.tracks || []).length > 0);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(10);
    }
  });
});
