import { describe, it, expect } from 'vitest';
import * as satellite from 'satellite.js';
import { parseTle, propagatePosition } from '../src/layers/satellites.js';
import { predictPasses, passCandidates, groupTrains, meanAltitudeKm, LOW_STARLINK_KM, MAX_LOW_STARLINK } from '../src/services/passes.js';
import { sunAltitude } from '../src/services/sky.js';

// The ISS element set the satellite tests use (epoch 1 January 2024, 12:00 UTC).
const ISS = ['ISS (ZARYA)', '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9006', '2 25544  51.6400 208.9163 0006317  69.9862  25.2906 15.50000000    19'];
const withMotion = (revsPerDay, norad = '25544') => [ISS[0], ISS[1].replace('25544', norad), ISS[2].replace('25544', norad).replace('15.50000000', revsPerDay.toFixed(8))];
const sat = (lines, group) => ({ ...parseTle(lines.join('\n'))[0], group });
const LONDON = { lat: 51.5, lon: -0.13 };
const noPause = async () => {};

function elevation(s, { lat, lon }, date) {
  const observer = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0.05 };
  const pv = propagatePosition(s.satrec, date);
  return satellite.radiansToDegrees(satellite.ecfToLookAngles(observer, satellite.eciToEcf(pv.position, satellite.gstime(date))).elevation);
}

describe('visible passes', () => {
  it('finds the ISS crossing a dark sky, with a start, a highest point and an end that hold up', async () => {
    const iss = sat(ISS, 'Space stations');
    const passes = await predictPasses([iss], { ...LONDON, start: new Date('2024-01-10T12:00:00Z'), pause: noPause });
    expect(passes.length).toBeGreaterThan(0);
    for (const p of passes) {
      expect(p.name).toBe('ISS (ZARYA)');
      expect(p.start.date <= p.peak.date && p.peak.date <= p.end.date).toBe(true);
      expect(p.end.date - p.start.date).toBeLessThan(15 * 60e3); // a low orbit crosses the sky in minutes
      expect(p.peak.el).toBeGreaterThanOrEqual(p.start.el);
      for (const pt of [p.start, p.peak, p.end]) {
        expect(pt.el).toBeGreaterThanOrEqual(10);
        expect(sunAltitude(LONDON.lat, LONDON.lon, pt.date)).toBeLessThanOrEqual(-6); // the sky here is dark
        expect(elevation(iss, LONDON, pt.date)).toBeCloseTo(pt.el, 5);
        expect(pt.az).toBeGreaterThanOrEqual(0);
        expect(pt.az).toBeLessThan(360);
      }
    }
  });

  it('lists nothing in daylight, even when the ISS is high overhead', async () => {
    // On 1 January 2024 the ISS crossed 73° above London at 13:32 UTC, in full daylight.
    const iss = sat(ISS, 'Space stations');
    expect(elevation(iss, LONDON, new Date('2024-01-01T13:32:00Z'))).toBeGreaterThan(60);
    const passes = await predictPasses([iss], { ...LONDON, start: new Date('2024-01-01T13:00:00Z'), hours: 1, pause: noPause });
    expect(passes).toEqual([]);
  });

  it('finds nothing where the sky never gets dark (Svalbard at midsummer)', async () => {
    const passes = await predictPasses([sat(ISS, 'Space stations')], { lat: 78.2, lon: 15.6, start: new Date('2024-06-21T00:00:00Z'), pause: noPause });
    expect(passes).toEqual([]);
  });

  it('starts a pass already under way at the moment asked, not before it', async () => {
    const iss = sat(ISS, 'Space stations');
    const [first] = await predictPasses([iss], { ...LONDON, start: new Date('2024-01-10T12:00:00Z'), pause: noPause });
    const mid = new Date((first.start.date.getTime() + first.end.date.getTime()) / 2);
    const [again] = await predictPasses([iss], { ...LONDON, start: mid, hours: 1, pause: noPause });
    expect(again.start.date.getTime()).toBe(mid.getTime());
  });

  it('yields to the page between batches of satellites', async () => {
    const many = Array.from({ length: 60 }, (_, i) => sat(withMotion(15.5, String(30000 + i)), 'Brightest satellites'));
    let pauses = 0;
    await predictPasses(many, { ...LONDON, start: new Date('2024-01-10T18:00:00Z'), hours: 2, pause: async () => pauses++ });
    expect(pauses).toBeGreaterThanOrEqual(2);
  });
});

describe('which satellites to predict', () => {
  it('reads a satellite’s height from its mean motion', () => {
    const iss = sat(ISS, 'Space stations');
    expect(meanAltitudeKm(iss.satrec)).toBeGreaterThan(380);
    expect(meanAltitudeKm(iss.satrec)).toBeLessThan(440);
    expect(meanAltitudeKm(sat(withMotion(15.06), 'Starlink').satrec)).toBeGreaterThan(530); // the operational Starlink shell
  });

  it('keeps every station and bright satellite, and only the low Starlinks', () => {
    const list = [
      sat(withMotion(15.06, '40001'), 'Space stations'),
      sat(withMotion(14.2, '40002'), 'Brightest satellites'),
      sat(withMotion(15.06, '40003'), 'Starlink'), // ~550 km, in service
      sat(withMotion(15.75, '40004'), 'Starlink'), // ~340 km, a new batch climbing
    ];
    expect(meanAltitudeKm(list[3].satrec)).toBeLessThan(LOW_STARLINK_KM);
    expect(passCandidates(list).map((s) => s.norad)).toEqual(['40001', '40002', '40004']);
  });

  it('keeps no more than a few hundred low Starlinks, the lowest first', () => {
    const many = Array.from({ length: MAX_LOW_STARLINK + 50 }, (_, i) => sat(withMotion(15.7 + i / 10000, String(50000 + i)), 'Starlink'));
    const kept = passCandidates(many);
    expect(kept).toHaveLength(MAX_LOW_STARLINK);
    expect(kept[0].norad).toBe(String(50000 + MAX_LOW_STARLINK + 49)); // the fastest, so the lowest
  });
});

describe('Starlink trains', () => {
  const at = (min, az = 250, el = 40) => ({ date: new Date(Date.UTC(2024, 0, 10, 18, 0) + min * 60e3), az, el });
  const pass = (name, group, min, az = 250, peakEl = 40) => ({ name, group, start: at(min, az, 10), peak: at(min + 3, az - 60, peakEl), end: at(min + 6, az - 120, 10) });

  it('joins low Starlinks crossing one after another along the same way into one train', () => {
    const passes = [
      pass('STARLINK-1', 'Starlink', 0),
      pass('STARLINK-2', 'Starlink', 0.5, 252, 55),
      pass('STARLINK-3', 'Starlink', 1.2, 248),
      pass('STARLINK-4', 'Starlink', 2, 251),
      pass('ISS (ZARYA)', 'Space stations', 1, 300),
      pass('STARLINK-9', 'Starlink', 1, 90), // the same minutes, another part of the sky
      pass('STARLINK-10', 'Starlink', 30, 250), // later, on its own
    ];
    const out = groupTrains(passes);
    const train = out.find((p) => p.train);
    expect(train.train).toBe(4);
    expect(train.start).toEqual(passes[0].start);
    expect(train.peak.el).toBe(55);
    expect(train.end).toEqual(passes[3].end);
    expect(out.map((p) => p.train ? `train ${p.train}` : p.name)).toEqual(['train 4', 'ISS (ZARYA)', 'STARLINK-9', 'STARLINK-10']);
  });

  it('leaves two Starlinks as two passes', () => {
    const out = groupTrains([pass('STARLINK-1', 'Starlink', 0), pass('STARLINK-2', 'Starlink', 1)]);
    expect(out.map((p) => p.name)).toEqual(['STARLINK-1', 'STARLINK-2']);
  });
});
