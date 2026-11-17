import * as satellite from 'satellite.js';

/**
 * Orbit maths for the satellite layer (satellite.js, about 90 kB). It is loaded
 * with the first element sets, not with the app: most visits never turn the
 * layer on or check a sighting against satellites.
 */

/**
 * The satellite's position (km, ECI) at `date`, or null. satellite.js does not throw on a damaged element set:
 * it hands back a position of NaN, which on the globe stops Cesium drawing at all ("Invalid array length").
 */
export function propagatePosition(satrec, date) {
  const pv = satellite.propagate(satrec, date);
  const r = pv?.position;
  if (!r || typeof r === 'boolean' || !Number.isFinite(r.x + r.y + r.z)) return null;
  return { ...pv, position: r };
}

export function parseTle(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const [name, l1, l2] = lines.slice(i, i + 3);
    if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue;
    try {
      out.push({ name: name.trim(), satrec: satellite.twoline2satrec(l1, l2), norad: l2.slice(2, 7).trim() });
    } catch {}
  }
  return out;
}

/** Latitude, longitude, height (km) and speed (km/s) at `date`, or null. */
export function geodeticAt(satrec, date) {
  const pv = propagatePosition(satrec, date);
  if (!pv) return null;
  const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    altKm: geo.height,
    speed: pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null,
  };
}

/**
 * A function giving where each satellite stands in an observer's sky at `date`:
 * { elevation, azimuth (degrees), rangeKm, position (km, ECI) }, or null.
 */
export function skyFrom(lat, lon, date) {
  const gmst = satellite.gstime(date);
  const observer = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0.1 };
  return (satrec) => {
    const pv = propagatePosition(satrec, date);
    if (!pv) return null;
    const look = satellite.ecfToLookAngles(observer, satellite.eciToEcf(pv.position, gmst));
    return { elevation: satellite.radiansToDegrees(look.elevation), azimuth: satellite.radiansToDegrees(look.azimuth), rangeKm: look.rangeSat, position: pv.position };
  };
}
