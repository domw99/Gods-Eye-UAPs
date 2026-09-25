import * as A from 'astronomy-engine';

/**
 * What was in the sky at a place and moment: the Sun (for daylight or
 * twilight), the Moon with its phase, the naked-eye planets and the brightest
 * stars. Many UAP reports turn out to be Venus, Jupiter, a bright star or the
 * Moon, so this is shown next to every case.
 */

// J2000 right ascension (hours), declination (degrees) and visual magnitude.
export const BRIGHT_STARS = [
  ['Sirius', 6.7525, -16.7161, -1.46],
  ['Canopus', 6.3992, -52.6957, -0.74],
  ['Alpha Centauri', 14.6601, -60.834, -0.27],
  ['Arcturus', 14.261, 19.1825, -0.05],
  ['Vega', 18.6156, 38.7837, 0.03],
  ['Capella', 5.2782, 45.998, 0.08],
  ['Rigel', 5.2423, -8.2016, 0.13],
  ['Procyon', 7.655, 5.225, 0.34],
  ['Betelgeuse', 5.9195, 7.4071, 0.5],
  ['Achernar', 1.6286, -57.2368, 0.46],
  ['Altair', 19.8464, 8.8683, 0.77],
  ['Aldebaran', 4.5987, 16.5093, 0.85],
  ['Antares', 16.4901, -26.432, 0.96],
  ['Spica', 13.4199, -11.1613, 0.97],
  ['Pollux', 7.7553, 28.0262, 1.14],
  ['Fomalhaut', 22.9608, -29.6222, 1.16],
  ['Deneb', 20.6905, 45.2803, 1.25],
];

const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

export function daylight(sunAlt) {
  if (sunAlt > -0.833) return 'Daylight';
  if (sunAlt > -6) return 'Civil twilight';
  if (sunAlt > -12) return 'Nautical twilight';
  if (sunAlt > -18) return 'Astronomical twilight';
  return 'Night';
}

function moonPhaseName(deg) {
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.round(deg / 45) % 8];
}

function horizonOf(body, time, observer) {
  const eq = A.Equator(body, time, observer, true, true);
  return A.Horizon(time, observer, eq.ra, eq.dec, 'normal');
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {Date|string} when
 * @param {{ elevation?: number, minAlt?: number }} [opts]
 * @returns {{ time: Date, sun: {alt:number, az:number}, light: string, bodies: Array<{name:string, kind:string, alt:number, az:number, mag:number, note?:string}> }}
 */
export function skyAt(lat, lon, when, { elevation = 0, minAlt = -1 } = {}) {
  const time = new Date(when);
  const t = A.MakeTime(time);
  const observer = new A.Observer(lat, lon, elevation);
  const sunH = horizonOf(A.Body.Sun, t, observer);
  const bodies = [];

  const moonH = horizonOf(A.Body.Moon, t, observer);
  const phase = A.MoonPhase(t);
  const illum = A.Illumination(A.Body.Moon, t);
  bodies.push({
    name: 'Moon',
    kind: 'moon',
    alt: moonH.altitude,
    az: moonH.azimuth,
    mag: illum.mag,
    phase,
    note: `${moonPhaseName(phase)}, ${Math.round(illum.phase_fraction * 100)}% lit`,
  });

  for (const name of PLANETS) {
    const h = horizonOf(A.Body[name], t, observer);
    const mag = A.Illumination(A.Body[name], t).mag;
    bodies.push({ name, kind: 'planet', alt: h.altitude, az: h.azimuth, mag });
  }

  // Stars: precess J2000 coordinates to the date, then to the horizon.
  const rot = A.Rotation_EQJ_EQD(t);
  for (const [name, ra, dec, mag] of BRIGHT_STARS) {
    const vec = A.RotateVector(rot, A.VectorFromSphere(new A.Spherical(dec, ra * 15, 1), t));
    const eq = A.EquatorFromVector(vec);
    const h = A.Horizon(t, observer, eq.ra, eq.dec, 'normal');
    bodies.push({ name, kind: 'star', alt: h.altitude, az: h.azimuth, mag });
  }

  return {
    time,
    sun: { alt: sunH.altitude, az: sunH.azimuth },
    light: daylight(sunH.altitude),
    bodies: bodies.filter((b) => b.alt >= minAlt).sort((a, b) => a.mag - b.mag),
  };
}

/** Which listed bodies does a piece of text (an official explanation) name? */
export function bodiesNamedIn(text = '') {
  const names = ['Moon', ...PLANETS, ...BRIGHT_STARS.map((s) => s[0])];
  return new Set(names.filter((n) => new RegExp(`\\b${n}\\b`, 'i').test(text)));
}
