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

import { readFileSync } from 'node:fs';
import { nearestHourIndex, pickHour, driftToward, trackVsWind, weatherAvailable } from '../src/services/weather.js';
import { toArea, pointInRing, areasAt, formatFt, nearUS } from '../src/services/airspace.js';
import { altitudeFt } from '../scripts/build-airspace.mjs';

describe('weather helpers', () => {
  const json = {
    elevation: 10,
    hourly: {
      time: ['2013-04-26T00:00', '2013-04-26T01:00', '2013-04-26T02:00'],
      wind_speed_10m: [20, 24, 26],
      wind_direction_10m: [40, 45, 50],
    },
  };
  it('picks the nearest hour within 90 minutes', () => {
    expect(nearestHourIndex(json.hourly.time, '2013-04-26T01:20:00Z')).toBe(1);
    expect(nearestHourIndex(json.hourly.time, '2013-04-27T01:20:00Z')).toBe(-1);
    expect(pickHour(json, '2013-04-26T01:40:00Z').wind_speed_10m).toBe(26);
  });
  it('turns wind "from" into drift "toward"', () => {
    expect(driftToward(45)).toBe(225);
    expect(driftToward(270)).toBe(90);
  });
  it('recognises a path drifting with the wind', () => {
    // ~20 km east in an hour, wind from the west at 20 km/h.
    const track = { points: [[-100, 40, 1000, 0], [-99.765, 40, 1000, 3600]] };
    const wx = { wind_speed_100m: 20, wind_direction_100m: 270 };
    expect(trackVsWind(track, wx).verdict).toBe('with-wind');
    expect(trackVsWind(track, { wind_speed_100m: 20, wind_direction_100m: 90 }).verdict).toBe('against-wind');
    expect(trackVsWind({ points: [[-100, 40, 1000, 0], [-90, 40, 1000, 600]] }, wx).verdict).toBe('fast');
  });
  it('knows the archive starts in 1940', () => {
    expect(weatherAvailable('1939-06-01T00:00:00Z')).toBe(false);
    expect(weatherAvailable('1947-06-24T21:59:00Z')).toBe(true);
  });
});

describe('military airspace', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data/airspace.json', import.meta.url)));
  const areas = data.features.map(toArea);
  it('has a sane dataset', () => {
    expect(areas.length).toBeGreaterThan(1000);
    for (const a of areas) {
      expect(a.upperFt).toBeGreaterThanOrEqual(a.lowerFt);
      expect(a.polygons.length).toBeGreaterThan(0);
    }
  });
  it('puts the Nimitz encounter inside warning area W-291', () => {
    const c = CASES.find((x) => x.id === 'nimitz-tic-tac-2004');
    expect(areasAt(areas, c.lon, c.lat).map((a) => a.name).join(' ')).toMatch(/W-291/);
  });
  it('puts the White House inside prohibited area P-56', () => {
    expect(areasAt(areas, -77.0365, 38.8977).map((a) => a.name).join(' ')).toMatch(/P-56/);
  });
  it('ray-casts simple rings and formats altitudes', () => {
    const square = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0];
    expect(pointInRing(0.5, 0.5, square)).toBe(true);
    expect(pointInRing(1.5, 0.5, square)).toBe(false);
    expect(formatFt(0)).toBe('surface');
    expect(formatFt(80000)).toBe('FL800');
    expect(formatFt(99999)).toBe('unlimited');
    expect(altitudeFt('180', 'FL', 'STD')).toBe(18000);
    expect(altitudeFt('-9998', null, 'UNLTD')).toBe(99999);
    expect(nearUS(40, -100)).toBe(true);
    expect(nearUS(51.5, -0.1)).toBe(false);
  });
});

import { rankCandidates, angularSep, confidenceLabel } from '../src/services/explain.js';
import { isSunlit } from '../src/layers/satellites.js';

describe('sighting checker', () => {
  const sky = {
    sun: { alt: -20, az: 300 },
    bodies: [
      { name: 'Venus', kind: 'planet', alt: 20, az: 250, mag: -4.3 },
      { name: 'Sirius', kind: 'star', alt: 8, az: 140, mag: -1.46 },
      { name: 'Moon', kind: 'moon', alt: 50, az: 170, mag: -11, note: 'Full Moon' },
    ],
  };
  it('measures angles on the sky', () => {
    expect(angularSep(0, 90, 180, 90)).toBeCloseTo(0);
    expect(angularSep(0, 0, 90, 0)).toBeCloseTo(90);
  });
  it('ranks Venus first for a bright, still light low in the WSW', () => {
    const r = rankCandidates({ report: { az: 247.5, alt: 20, motion: 'still', bright: true }, sky });
    expect(r[0].name).toBe('Venus');
    expect(confidenceLabel(r[0].score)).toBe('Strong match');
  });
  it('drops planets when the object moved fast', () => {
    const r = rankCandidates({ report: { az: 247.5, alt: 20, motion: 'fast' }, sky });
    expect(r[0].name).not.toBe('Venus');
  });
  it('ranks a nearby twilight launch highly', () => {
    const twilight = { ...sky, sun: { alt: -8, az: 280 } };
    const r = rankCandidates({
      report: { motion: 'steady' },
      sky: twilight,
      launches: [{ name: 'Falcon 9 | Starlink', gapMin: -12, km: 400 }],
    });
    expect(r[0].kind).toBe('launch');
  });
  it('matches drifting orange lights with the wind', () => {
    const r = rankCandidates({
      report: { motion: 'drift', orange: true, towardAz: 90 },
      sky: { sun: { alt: -20, az: 0 }, bodies: [] },
      weather: { wind_speed_100m: 15, wind_direction_100m: 270 },
    });
    expect(r[0].kind).toBe('drift');
    expect(r[0].reason).toMatch(/the way you saw it move/);
  });
  it('flags a Starlink train for a line of moving lights', () => {
    const sats = Array.from({ length: 20 }, (_, i) => ({ name: `STARLINK-${i}`, group: 'Starlink', azimuth: 300 + i * 0.5, elevation: 30, sunlit: true }));
    const r = rankCandidates({ report: { az: 300, alt: 30, motion: 'formation' }, sky: { sun: { alt: -15, az: 290 }, bodies: [] }, satellites: sats });
    expect(r[0].name).toBe('Starlink train');
  });
  it('tests Earth shadow', () => {
    const sun = { x: 1, y: 0, z: 0 };
    expect(isSunlit({ x: 7000, y: 0, z: 0 }, sun)).toBe(true);
    expect(isSunlit({ x: -7000, y: 0, z: 0 }, sun)).toBe(false);
    expect(isSunlit({ x: -3000, y: 6800, z: 0 }, sun)).toBe(true);
  });
});

import { sentences, buildStory } from '../src/ui/story.js';

describe('story mode', () => {
  it('splits sentences without breaking abbreviations or initials', () => {
    expect(sentences('It is one of the most-witnessed UFO events in U.S. history. Then it ended.')).toEqual([
      'It is one of the most-witnessed UFO events in U.S. history.',
      'Then it ended.',
    ]);
    expect(sentences('Cdr. David Fravor and Lt. Cdr. Alex Dietrich saw it. It left.')).toHaveLength(2);
    expect(sentences("It struck Judge J. S. Proctor's windmill. Nobody was hurt.")).toHaveLength(2);
  });
  it('builds a story for every case', () => {
    for (const c of CASES) {
      const steps = buildStory(c);
      expect(steps.length).toBeGreaterThan(2);
      for (const s of steps) expect(s.text.length).toBeGreaterThan(3);
    }
  });
});
