import * as satellite from 'satellite.js';
import * as Astro from 'astronomy-engine';
import { propagatePosition } from '../layers/orbits.js';
import { isSunlit } from '../layers/satellites.js';
import { sunAltitude } from './sky.js';

/**
 * Visible satellite passes over a place in the hours ahead, as FindStarlink and
 * Heavens-Above predict them: the satellite is above `minEl`, in sunlight, and the
 * sky at the observer is dark. Knowing that the ISS or a Starlink train will cross
 * at 21:14 explains a report before anyone makes it.
 */

const MU = 398600.4418; // km³/s², Earth's gravitational parameter
const EARTH_RADIUS_KM = 6378.137;

/** The satellite's mean height above the equator (km), from its element set's mean motion. */
export function meanAltitudeKm(satrec) {
  const n = satrec.no / 60; // rad/min → rad/s
  return Math.cbrt(MU / (n * n)) - EARTH_RADIUS_KM;
}

/**
 * Which satellites to predict. Every space station and bright satellite, but of the thousands of Starlinks
 * only the low ones: a batch climbing from its release orbit (the "train" people report) or one coming down.
 * The operational shell, about 550 km up, is faint and would take minutes to propagate.
 */
export const LOW_STARLINK_KM = 450;
// If SpaceX ever fills a shell below that, the lowest few hundred still finish in a few seconds on a phone.
export const MAX_LOW_STARLINK = 400;
export function passCandidates(sats) {
  const low = sats
    .filter((s) => s.group === 'Starlink')
    .map((s) => ({ s, km: meanAltitudeKm(s.satrec) }))
    .filter(({ km }) => km < LOW_STARLINK_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_LOW_STARLINK);
  return [...sats.filter((s) => s.group !== 'Starlink'), ...low.map(({ s }) => s)];
}

const unit = (v) => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

/** The things a step needs that are the same for every satellite: Earth's rotation, the Sun's direction, the sky's darkness. */
function stepAt(date, lat, lon) {
  return {
    date,
    gmst: satellite.gstime(date),
    sun: unit(Astro.GeoVector(Astro.Body.Sun, Astro.MakeTime(date), true)),
    sunAlt: sunAltitude(lat, lon, date),
  };
}

/** Where a satellite is from the observer at a step, and whether it can be seen: { el, az, visible }, or null. */
function look(sat, step, observer, minEl, maxSunAlt) {
  const pv = propagatePosition(sat.satrec, step.date);
  if (!pv) return null;
  const angles = satellite.ecfToLookAngles(observer, satellite.eciToEcf(pv.position, step.gmst));
  const el = satellite.radiansToDegrees(angles.elevation);
  const az = (satellite.radiansToDegrees(angles.azimuth) + 360) % 360;
  return { el, az, visible: el >= minEl && step.sunAlt <= maxSunAlt && isSunlit(pv.position, step.sun) };
}

/**
 * Visible passes over (lat, lon) from `start` for `hours`, soonest first: { name, group, norad, start, peak, end },
 * each point { date, az, el }. Steps of `stepSec`, then the start and end refined to `fineSec`. Only dark steps are
 * propagated (daylight passes can't be seen), and it yields to the page every few satellites.
 */
export async function predictPasses(sats, { lat, lon, start = new Date(), hours = 24, stepSec = 60, fineSec = 10, minEl = 10, maxSunAlt = -6, pause = () => new Promise((r) => setTimeout(r)) } = {}) {
  const observer = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0.05 };
  const t0 = start.getTime();
  const steps = [];
  for (let s = 0; s <= hours * 3600; s += stepSec) {
    const step = stepAt(new Date(t0 + s * 1000), lat, lon);
    // A step in daylight is kept as a break, so a pass never runs across it.
    steps.push(step.sunAlt <= maxSunAlt ? step : null);
  }
  if (!steps.some(Boolean)) return [];
  const edge = (sat, from, dir) => {
    // Walk from the last visible step toward the next, in fine steps, to the moment it stops being visible.
    let last = from;
    for (let s = fineSec; s < stepSec; s += fineSec) {
      const date = new Date(from.date.getTime() + dir * s * 1000);
      if (date < start) break; // a pass already under way starts now, not before
      const l = look(sat, stepAt(date, lat, lon), observer, minEl, maxSunAlt);
      if (!l?.visible) break;
      last = { date, az: l.az, el: l.el };
    }
    return last;
  };
  const out = [];
  for (let i = 0; i < sats.length; i++) {
    const sat = sats[i];
    let run = null;
    const close = () => {
      if (!run) return;
      out.push({ name: sat.name, group: sat.group, norad: sat.norad, start: edge(sat, run.start, -1), peak: run.peak, end: edge(sat, run.end, 1) });
      run = null;
    };
    for (const step of steps) {
      const l = step && look(sat, step, observer, minEl, maxSunAlt);
      if (!l?.visible) {
        close();
        continue;
      }
      const point = { date: step.date, az: l.az, el: l.el };
      if (!run) run = { start: point, peak: point, end: point };
      else {
        run.end = point;
        if (l.el > run.peak.el) run.peak = point;
      }
    }
    close();
    if (i % 25 === 24) await pause();
  }
  return out.sort((a, b) => a.start.date - b.start.date);
}

/**
 * Low Starlinks that cross within a few minutes of one another along the same way are one train: a batch still
 * in a line. Chained by start time (`gapMs` from the one before) and by where they appear (`azTol` degrees).
 * Three or more make a train; other passes are left as they are.
 */
export function groupTrains(passes, { gapMs = 3 * 60e3, azTol = 30, min = 3 } = {}) {
  const starlink = passes.filter((p) => p.group === 'Starlink').sort((a, b) => a.start.date - b.start.date);
  const others = passes.filter((p) => p.group !== 'Starlink');
  const clusters = [];
  for (const p of starlink) {
    const c = clusters.find((k) => {
      const prev = k[k.length - 1];
      const d = Math.abs(((p.start.az - prev.start.az + 540) % 360) - 180);
      return p.start.date - prev.start.date <= gapMs && d <= azTol;
    });
    if (c) c.push(p);
    else clusters.push([p]);
  }
  const trains = [];
  for (const c of clusters) {
    if (c.length < min) {
      trains.push(...c);
      continue;
    }
    const peak = c.reduce((best, p) => (p.peak.el > best.el ? p.peak : best), c[0].peak);
    const end = c.reduce((last, p) => (p.end.date > last.date ? p.end : last), c[0].end);
    trains.push({ name: 'Starlink', group: 'Starlink', train: c.length, start: c[0].start, peak, end });
  }
  return [...others, ...trains].sort((a, b) => a.start.date - b.start.date);
}
