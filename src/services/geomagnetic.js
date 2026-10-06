/**
 * Geomagnetic activity at the time of a case: the planetary Kp index, every
 * three hours since 1932 (GFZ Potsdam, CC BY 4.0), bundled by scripts/build-kp.mjs.
 * A strong storm lights the aurora far from the poles, and an aurora seen from
 * lower latitudes is a classic cause of strange lights in the sky.
 */
export const KP_FILE = 'data/kp.json';
export const KP_START = Date.UTC(1932, 0, 1);
const STEP_MS = 3 * 3600 * 1000;

let loading = null;
/** The bundled Kp series, fetched once. */
export function loadKp(base = './') {
  loading ||= fetch(`${base}${KP_FILE}`).then((res) => {
    if (!res.ok) throw new Error(`Kp ${res.status}`);
    return res.json();
  });
  loading.catch(() => (loading = null)); // a failed fetch can be tried again
  return loading;
}

/** Kp in thirds (0 to 27) for the three-hour interval holding `when`, or null (before 1932, after the data, or missing). */
export function kpThirds(data, when) {
  const t = new Date(when).getTime();
  if (!Number.isFinite(t) || t < KP_START) return null;
  const i = Math.floor((t - KP_START) / STEP_MS);
  const ch = data?.values?.[i];
  if (!ch || ch === '.') return null;
  const v = parseInt(ch, 36);
  return Number.isFinite(v) ? v : null;
}

/** Kp as it is written: 0o, 0+, 1-, 1o, 1+ … 9o. */
export function kpLabel(thirds) {
  const whole = Math.round(thirds / 3);
  const rest = thirds - whole * 3;
  return `${whole}${rest === 0 ? 'o' : rest > 0 ? '+' : '-'}`;
}

/** NOAA's geomagnetic storm scale: 'G1' (minor) to 'G5' (extreme), or null below a storm. */
export function stormScale(thirds) {
  if (thirds == null || thirds < 14) return null;
  if (thirds <= 16) return 'G1';
  if (thirds <= 19) return 'G2';
  if (thirds <= 22) return 'G3';
  if (thirds <= 26) return 'G4';
  return 'G5';
}

export const STORM_NAMES = { G1: 'minor storm', G2: 'moderate storm', G3: 'strong storm', G4: 'severe storm', G5: 'extreme storm' };

// The geomagnetic pole (a centred dipole, about where it is now; in 1950 it was a few degrees away, so the latitude is approximate).
const POLE_LAT = (80.7 * Math.PI) / 180;
const POLE_LON = (-72.7 * Math.PI) / 180;

/** Geomagnetic latitude in degrees of a place on the Earth's surface (dipole model). */
export function geomagneticLatitude(lat, lon) {
  const p = (lat * Math.PI) / 180;
  const l = (lon * Math.PI) / 180;
  const s = Math.sin(p) * Math.sin(POLE_LAT) + Math.cos(p) * Math.cos(POLE_LAT) * Math.cos(l - POLE_LON);
  return (Math.asin(Math.max(-1, Math.min(1, s))) * 180) / Math.PI;
}

/** The lowest geomagnetic latitude the auroral oval reaches at midnight for a Kp (the usual linear fit: about 66.5° at Kp 0, 48° at Kp 9). */
export const ovalEdge = (kp) => 66.5 - 2.04 * kp;

/**
 * Could the aurora have been seen from here? 'overhead' (inside the oval),
 * 'horizon' (within about 8° of its edge: a glow low toward the pole) or 'no'.
 * Only when it was dark, which is for the caller to say.
 */
export function auroraChance(thirds, lat, lon) {
  if (thirds == null) return null;
  const edge = ovalEdge(thirds / 3);
  const here = Math.abs(geomagneticLatitude(lat, lon));
  const margin = 8;
  return { geomagLat: here, edge, chance: here >= edge ? 'overhead' : here >= edge - margin ? 'horizon' : 'no' };
}
