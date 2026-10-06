/**
 * Airports and airfields near a place (OurAirports, public domain), bundled by
 * scripts/build-airfields.mjs and sorted by latitude. An aircraft on approach
 * or climbing out, with its landing lights on, is among the most common causes
 * of a report, so "what is near here" is part of the answer.
 */
import { haversineKm, bearingDeg } from '../util/geo.js';

export const AIRFIELDS_FILE = 'data/airfields.json';
export const SIZES = ['large airport', 'medium airport', 'small airport'];

let loading = null;
/** The bundled airfields, fetched once. */
export function loadAirfields(base = './') {
  loading ||= fetch(`${base}${AIRFIELDS_FILE}`).then((res) => {
    if (!res.ok) throw new Error(`Airfields ${res.status}`);
    return res.json();
  });
  loading.catch(() => (loading = null));
  return loading;
}

/** The airfields within maxKm of a point, nearest first: { name, code, size, military, country, km, bearing, lat, lon }. */
export function nearestAirfields(data, lat, lon, { limit = 4, maxKm = 80 } = {}) {
  const list = data?.airfields || [];
  const dLat = maxKm / 111;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][1] < lat - dLat) lo = mid + 1;
    else hi = mid;
  }
  const found = [];
  for (let i = lo; i < list.length && list[i][1] <= lat + dLat; i++) {
    const [name, flat, flon, size, code, country, military] = list[i];
    const km = haversineKm(lat, lon, flat, flon);
    if (km <= maxKm) found.push({ name, code, size, military: Boolean(military), country, km, bearing: bearingDeg(lat, lon, flat, flon), lat: flat, lon: flon });
  }
  return found.sort((a, b) => a.km - b.km).slice(0, limit);
}

/** How near an airfield makes aircraft a likely cause: 'close' (within 15 km), 'near' (within 40 km), or null. */
export function airfieldProximity(km, size) {
  const reach = size === 2 ? 0.6 : 1; // a small field has far less traffic
  if (km <= 15 * reach) return 'close';
  if (km <= 40 * reach) return 'near';
  return null;
}
