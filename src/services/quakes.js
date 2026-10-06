/**
 * Earthquakes of the last 24 hours, from the USGS public GeoJSON feed (no key,
 * open to browsers). A strong quake is sometimes reported as a boom, a shaking
 * ground or odd lights in the sky, so the layer helps check a sighting made
 * the same day.
 */
import { fetchWithTimeout } from '../util/net.js';

export const QUAKE_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

/** The feed's features as plain rows, strongest first. */
export function parseQuakes(geojson) {
  const rows = [];
  for (const f of geojson?.features || []) {
    const [lon, lat, depth] = f.geometry?.coordinates || [];
    const p = f.properties || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(p.time)) continue;
    rows.push({
      id: f.id,
      lat,
      lon,
      depthKm: Number.isFinite(depth) ? depth : null,
      mag: Number.isFinite(p.mag) ? p.mag : null,
      place: p.place || 'Unnamed place',
      time: p.time,
      url: typeof p.url === 'string' && p.url.startsWith('https://earthquake.usgs.gov/') ? p.url : null,
      felt: Number.isFinite(p.felt) ? p.felt : null,
    });
  }
  return rows.sort((a, b) => (b.mag ?? -9) - (a.mag ?? -9) || b.time - a.time);
}

/** Marker size in pixels for a magnitude: small quakes stay small, big ones stand out. */
export const quakeSize = (mag) => Math.round(Math.min(34, Math.max(9, 8 + (mag ?? 0) * 3.4)));

/** Colour by strength: amber for the small, orange and red for the strong. */
export const quakeColor = (mag) => (mag >= 6 ? '#ff4d4d' : mag >= 5 ? '#ff7a45' : mag >= 4 ? '#ffb547' : '#e6c37a');

let cache = { at: 0, rows: null };
/** The last day's quakes, kept for ten minutes. */
export async function loadQuakes(fetchImpl = fetchWithTimeout, now = Date.now()) {
  if (cache.rows && now - cache.at < 10 * 60e3) return cache.rows;
  const res = await fetchImpl(QUAKE_FEED);
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
  cache = { at: now, rows: parseQuakes(await res.json()) };
  return cache.rows;
}
