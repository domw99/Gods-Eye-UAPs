/**
 * "What did I see?" — rank ordinary explanations for a sighting from what
 * the app can check: the sky (planets, bright stars, the Moon), satellites
 * (for recent dates), rocket launches and the wind. Pure functions, so the
 * scoring is testable; the UI gathers the inputs.
 */
import { compass } from './sky.js';
import { driftToward } from './weather.js';
import { angleDiff } from '../util/geo.js';

export const HEIGHTS = {
  horizon: { label: 'Near the horizon (0–10°)', alt: 5 },
  low: { label: 'Low (10–30°)', alt: 20 },
  mid: { label: 'Half-way up (30–60°)', alt: 45 },
  high: { label: 'High overhead (60–90°)', alt: 75 },
};

export const MOTIONS = {
  still: 'Stayed still or barely moved',
  drift: 'Drifted slowly',
  steady: 'Moved steadily across the sky',
  fast: 'Moved fast or changed direction',
  formation: 'Several lights in a line or group',
};

/** Angle between two sky directions (azimuth/altitude in degrees). */
export function angularSep(az1, alt1, az2, alt2) {
  const r = Math.PI / 180;
  const c = Math.sin(alt1 * r) * Math.sin(alt2 * r) + Math.cos(alt1 * r) * Math.cos(alt2 * r) * Math.cos((az1 - az2) * r);
  return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}

function positionFactor(report, az, alt) {
  if (report.az == null) return { f: 0.45, sep: null };
  const sep = angularSep(report.az, report.alt ?? alt, az, alt);
  // Without a height, only the compass direction counts.
  const s = report.alt == null ? angleDiff(report.az, az) : sep;
  return { f: s < 8 ? 1 : s < 20 ? 0.75 : s < 35 ? 0.45 : 0.08, sep: s };
}

const clamp = (x) => Math.max(0, Math.min(1, x));
const where = (az, alt) => `${compass(az)}, ${Math.round(alt)}° up`;

/**
 * @param {object} input
 * @param {object} input.report  { az?, alt?, motion, blinking?, colours?, orange?, bright?, towardAz? }
 * @param {object} input.sky     output of skyAt()
 * @param {Array}  [input.satellites]  output of visibleAt(), or null if not checked
 * @param {Array}  [input.launches]    slim launches with gapMin and km, or null
 * @param {object} [input.weather]     output of weatherAt(), or null
 * @returns {Array<{kind:string, name:string, score:number, reason:string}>}
 */
export function rankCandidates({ report, sky, satellites = null, launches = null, weather = null }) {
  const out = [];
  const motion = report.motion || 'still';
  const dark = sky.sun.alt < -6;
  const overcast = (weather?.cloud_cover ?? 0) >= 90;

  // 1. Planets, bright stars and the Moon.
  for (const b of sky.bodies) {
    if (b.alt <= 0) continue;
    if (!dark && b.mag > -3.5) continue; // in daylight or bright twilight only Venus and the Moon show
    if (b.kind === 'star' && b.mag > 1) continue;
    const bright = b.mag <= -3 ? 1 : b.mag <= -1 ? 0.85 : b.mag <= 0.5 ? 0.65 : 0.5;
    const { f, sep } = positionFactor(report, b.az, b.alt);
    const still = { still: 1, drift: 0.8, steady: 0.25, fast: 0.12, formation: 0.15 }[motion];
    let score = bright * f * still;
    if (report.colours && b.alt < 20 && b.kind !== 'moon') score *= 1.25; // low stars twinkle through colours
    if (report.blinking && b.kind !== 'moon') score *= b.alt < 15 ? 1 : 0.6;
    if (overcast) score *= 0.35;
    if (b.kind === 'moon' && report.bright) score *= 1.1;
    const bits = [`${b.name} was ${where(b.az, b.alt)}`];
    if (sep != null) bits.push(sep < 8 ? 'right where you looked' : `${Math.round(sep)}° from where you looked`);
    if (b.kind === 'planet' && b.mag < -2) bits.push(`very bright (mag ${b.mag.toFixed(1)}), often reported as a hovering light`);
    if (b.kind === 'star' && b.alt < 15) bits.push('low stars twinkle and flash colours through thick air');
    if (b.kind === 'moon') bits.push(b.note || '');
    if (overcast) bits.push('but the sky was overcast');
    out.push({ kind: b.kind, name: b.name, score: clamp(score), reason: `${bits.filter(Boolean).join('; ')}.` });
  }

  // 2. Satellites (only for recent dates, only sunlit ones in a dark sky).
  if (satellites) {
    const lit = satellites.filter((s) => s.sunlit);
    const moving = { still: 0.1, drift: 0.35, steady: 1, fast: 0.4, formation: 0.9 }[motion];
    const iss = lit.find((s) => /\b(ISS|CSS)\b|ZARYA|TIANHE/i.test(s.name));
    if (iss && dark) {
      const { f, sep } = positionFactor(report, iss.azimuth, iss.elevation);
      out.push({
        kind: 'satellite',
        name: iss.name,
        score: clamp(0.95 * moving * f),
        reason: `A space station was ${where(iss.azimuth, iss.elevation)} and lit by the Sun${sep != null ? ` (${Math.round(sep)}° from where you looked)` : ''}. It looks like a very bright, steady light gliding across the sky in a few minutes.`,
      });
    }
    const starlink = lit.filter((s) => /STARLINK/i.test(s.name));
    const near = report.az == null ? starlink : starlink.filter((s) => positionFactor(report, s.azimuth, s.elevation).sep < 30);
    if (dark && near.length >= 5) {
      out.push({
        kind: 'satellite',
        name: 'Starlink train',
        score: clamp((motion === 'formation' ? 1 : 0.55) * moving * (near.length >= 15 ? 1 : 0.8)),
        reason: `${near.length} sunlit Starlink satellites were in that part of the sky. Freshly launched batches look like a line of lights moving together.`,
      });
    }
    const bright = lit.filter((s) => s.group === 'Brightest satellites' && !/STARLINK/i.test(s.name));
    const best = bright
      .map((s) => ({ s, ...positionFactor(report, s.azimuth, s.elevation) }))
      .sort((a, b) => b.f - a.f)[0];
    if (dark && best) {
      out.push({
        kind: 'satellite',
        name: best.s.name,
        score: clamp(0.6 * moving * best.f),
        reason: `A bright satellite was ${where(best.s.azimuth, best.s.elevation)} and sunlit. Satellites move steadily and can flare or fade out as they enter Earth's shadow.`,
      });
    }
  }

  // 3. Rocket launches.
  for (const l of launches || []) {
    if (l.km == null || l.km > 3000) continue;
    const soon = Math.abs(l.gapMin);
    const twilight = sky.sun.alt < -2 && sky.sun.alt > -18;
    const timeF = soon <= 30 ? 1 : soon <= 120 ? 0.7 : soon <= 360 ? 0.35 : 0.15;
    const distF = l.km < 600 ? 1 : l.km < 1500 ? 0.8 : 0.5;
    const score = timeF * distF * (twilight ? 1 : 0.7) * (motion === 'still' ? 0.7 : 1);
    out.push({
      kind: 'launch',
      name: l.name,
      score: clamp(score),
      reason: `Launched ${soon < 90 ? `${Math.round(soon)} min` : `${(soon / 60).toFixed(1)} h`} ${l.gapMin < 0 ? 'before' : 'after'} your sighting, ${Math.round(l.km).toLocaleString()} km away${twilight ? ', in twilight, when exhaust plumes glow in sunlight high above a dark sky' : ''}.`,
    });
  }

  // 4. Things carried by the wind: lanterns and balloons.
  if (weather && (weather.wind_direction_100m ?? weather.wind_direction_10m) != null) {
    const from = weather.wind_direction_100m ?? weather.wind_direction_10m;
    const speed = weather.wind_speed_100m ?? weather.wind_speed_10m;
    const toward = driftToward(from);
    const matches = report.towardAz != null ? angleDiff(report.towardAz, toward) <= 45 : null;
    const moveF = { still: 0.3, drift: 1, steady: 0.6, fast: 0.1, formation: 0.8 }[motion];
    let score = 0.45 * moveF * (report.orange ? 1.5 : 1) * (matches === true ? 1.5 : matches === false ? 0.35 : 1);
    out.push({
      kind: 'drift',
      name: report.orange ? 'Sky lanterns (flickering orange)' : 'Balloon or lantern',
      score: clamp(score),
      reason: `The wind was blowing toward the ${compass(toward)} at about ${Math.round(speed)} km/h${matches === true ? ', the way you saw it move' : matches === false ? ', not the way you saw it move' : ''}. Lanterns glow orange and flicker; party balloons catch sunlight.`,
    });
  }

  // 5. Aircraft: always possible, never checkable here.
  const planeF = { still: 0.25, drift: 0.35, steady: 0.8, fast: 0.5, formation: 0.45 }[motion];
  out.push({
    kind: 'aircraft',
    name: 'Aircraft or drone (not checked)',
    score: clamp(planeF * (report.blinking ? 1.2 : 0.8) * 0.55),
    reason: 'Planes with landing lights on can hang apparently still for minutes when flying toward you; drones hover and blink. Live flight data needs a server, so the app cannot check this.',
  });

  return out.sort((a, b) => b.score - a.score);
}

export const confidenceLabel = (score) => (score >= 0.6 ? 'Strong match' : score >= 0.35 ? 'Possible' : 'Unlikely');
