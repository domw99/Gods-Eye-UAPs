/**
 * Bright fireballs: meteors that burst in the atmosphere, as detected by U.S.
 * government sensors since 1988 (NASA CNEOS, public domain), bundled by
 * scripts/build-fireballs.mjs. A fireball outshines the Moon for a few seconds
 * and can be seen for hundreds of kilometres, so it is among the most common
 * causes of "a bright light that crossed the sky and went out". The record is
 * of the bigger events only; many smaller fireballs are never in it.
 */
import { haversineKm, bearingDeg } from '../util/geo.js';

export const FIREBALLS_FILE = 'data/fireballs.json';
/** The first year of the record. */
export const FIREBALLS_FROM = 1988;
/** How far away a fireball high in the air can be seen from the ground (km), for a rough check. */
export const SIGHT_KM = 600;

let loading = null;
/** The bundled fireballs, fetched once. */
export function loadFireballs(base = './') {
  loading ||= fetch(`${base}${FIREBALLS_FILE}`).then((res) => {
    if (!res.ok) throw new Error(`Fireballs ${res.status}`);
    return res.json();
  });
  loading.catch(() => (loading = null)); // a failed fetch can be tried again
  return loading;
}

/** The packed events as rows: { time (ms), lat, lon, energy (10^10 J), impactKt, heightKm, speed (km/s) }, oldest first; null where unmeasured. */
export function fireballRows(data) {
  return (data?.events || []).map(([s, lat, lon, energy, impactKt, heightKm, speed]) => ({ time: s * 1000, lat, lon, energy, impactKt, heightKm, speed }));
}

/**
 * The fireballs within `hours` of a moment and `maxKm` of a place, closest in
 * time first: each row plus gapMin (negative when it came first), km and bearing.
 */
export function fireballsNear(rows, when, lat, lon, { hours = 3, maxKm = SIGHT_KM, limit = 3 } = {}) {
  const t = new Date(when).getTime();
  if (!Number.isFinite(t) || !rows?.length) return [];
  const span = hours * 3600e3;
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].time < t - span) lo = mid + 1;
    else hi = mid;
  }
  const found = [];
  for (let i = lo; i < rows.length && rows[i].time <= t + span; i++) {
    const km = haversineKm(lat, lon, rows[i].lat, rows[i].lon);
    if (km <= maxKm) found.push({ ...rows[i], gapMin: (rows[i].time - t) / 60000, km, bearing: bearingDeg(lat, lon, rows[i].lat, rows[i].lon) });
  }
  return found.sort((a, b) => Math.abs(a.gapMin) - Math.abs(b.gapMin)).slice(0, limit);
}

/** Marker size in pixels for the energy of the impact in kilotons: small flashes stay small, Chelyabinsk (440 kt) stands out. */
export const fireballSize = (kt) => Math.round(Math.min(32, Math.max(10, 12 + 5 * Math.log10(Math.max(kt ?? 0.1, 0.01) / 0.1))));

/** How a fireball is described: the TNT equivalent of its energy. */
export function describeEnergy(kt) {
  if (kt == null) return null;
  const tons = kt * 1000;
  return tons >= 1000 ? { value: Math.round(kt * 10) / 10, unit: 'kt' } : { value: Math.round(tons), unit: 't' };
}
