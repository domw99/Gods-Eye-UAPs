/** Geographic helpers. */

const R = 6371.0088; // mean Earth radius, km
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Point a fraction f of the way along the great circle between two points. */
export function interpolateGreatCircle(lat1, lon1, lat2, lon2, f) {
  const φ1 = toRad(lat1), λ1 = toRad(lon1), φ2 = toRad(lat2), λ2 = toRad(lon2);
  const δ = haversineKm(lat1, lon1, lat2, lon2) / R;
  if (δ < 1e-9) return [lat1, lon1];
  const a = Math.sin((1 - f) * δ) / Math.sin(δ);
  const b = Math.sin(f * δ) / Math.sin(δ);
  const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
  const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
  const z = a * Math.sin(φ1) + b * Math.sin(φ2);
  return [toDeg(Math.atan2(z, Math.hypot(x, y))), toDeg(Math.atan2(y, x))];
}

/**
 * Densify a track so long legs follow the Earth's curvature instead of
 * cutting under it. Points are [lon, lat, altM, tSec, note?].
 */
export function densifyTrack(points, stepKm = 25) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    out.push(p);
    const q = points[i + 1];
    if (!q) break;
    const d = haversineKm(p[1], p[0], q[1], q[0]);
    const n = Math.floor(d / stepKm);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      const [lat, lon] = interpolateGreatCircle(p[1], p[0], q[1], q[0], f);
      out.push([lon, lat, p[2] + (q[2] - p[2]) * f, p[3] + (q[3] - p[3]) * f]);
    }
  }
  return out;
}

export function trackLengthKm(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++)
    d += haversineKm(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  return d;
}

export function formatDMS(lat, lon) {
  const f = (v, pos, neg) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = ((a - d) * 60 - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(0).padStart(2, '0')}″${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 90) return `${s} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} days`;
}

/** Deterministic spiral offset so co-located region pins do not overlap. */
export function spiralOffset(index, radiusKm, lat) {
  if (index === 0) return [0, 0];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const r = Math.min(radiusKm * 0.8, 18 * Math.sqrt(index) + 6) ;
  const θ = index * golden;
  const dLat = (r * Math.cos(θ)) / 111.32;
  const dLon = (r * Math.sin(θ)) / (111.32 * Math.max(0.2, Math.cos(toRad(lat))));
  return [dLat, dLon];
}

/** Initial great-circle bearing from point 1 to point 2, degrees clockwise from north. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

/** Smallest absolute difference between two bearings, 0–180°. */
export function angleDiff(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}
