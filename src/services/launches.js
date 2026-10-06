/**
 * Rocket launches from Launch Library 2 (The Space Devs), keyless. Launch
 * plumes at dusk and dawn, stage separations and re-entries are behind many
 * modern UAP reports, so the app shows launches as a layer and lets you check
 * for launches around the time of any sighting.
 *
 * Anonymous access allows about 15 requests an hour, so every answer is
 * cached in localStorage.
 */
import { setCached } from '../util/storage.js';

const API = 'https://ll.thespacedevs.com/2.3.0/launches/';
const HOUR = 3600e3;

export class RateLimitError extends Error {}

function readCache(key, ttl) {
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.t < ttl) return hit.data;
  } catch {
    /* ignore */
  }
  return null;
}
function writeCache(key, data) {
  setCached(key, JSON.stringify({ t: Date.now(), data })); // fine if it can't be kept
}

// A pad without coordinates has none; Number(null) would put it at 0°, 0°.
const coordinate = (v) => (v == null || v === '' ? NaN : Number(v));

export function slimLaunch(r) {
  const lat = coordinate(r.pad?.latitude);
  const lon = coordinate(r.pad?.longitude);
  const placed = Number.isFinite(lat) && Number.isFinite(lon);
  return {
    id: r.id,
    name: r.name,
    net: r.net,
    status: r.status?.abbrev || '',
    statusName: r.status?.name || '',
    provider: r.launch_service_provider?.name || '',
    rocket: r.rocket?.configuration?.full_name || '',
    mission: r.mission?.name || '',
    missionType: r.mission?.type || '',
    orbit: r.mission?.orbit?.abbrev || '',
    description: r.mission?.description || '',
    pad: r.pad?.name || '',
    location: r.pad?.location?.name || '',
    lat: placed ? lat : null,
    lon: placed ? lon : null,
    image: r.image?.thumbnail_url || null,
  };
}

async function query(params, cacheKey, ttl) {
  const cached = readCache(cacheKey, ttl);
  if (cached) return cached;
  const res = await fetch(`${API}?${new URLSearchParams({ limit: '100', ordering: 'net', ...params })}`);
  if (res.status === 429) throw new RateLimitError('Launch Library rate limit reached');
  if (!res.ok) throw new Error(`Launch Library HTTP ${res.status}`);
  const json = await res.json();
  const data = (json.results || []).map(slimLaunch);
  writeCache(cacheKey, data);
  return data;
}

/** Launches from `daysBack` ago to `daysAhead` ahead (for the live layer). */
export function launchesAroundNow(daysBack = 14, daysAhead = 30) {
  const now = Date.now();
  return query(
    {
      net__gte: new Date(now - daysBack * 24 * HOUR).toISOString(),
      net__lte: new Date(now + daysAhead * 24 * HOUR).toISOString(),
    },
    `ll2:window:${daysBack}:${daysAhead}`,
    0.5 * HOUR,
  );
}

/** Launches within ±hours of a moment (for checking a sighting). */
export function launchesNear(when, hours = 12) {
  const t = new Date(when).getTime();
  const from = new Date(t - hours * HOUR).toISOString();
  const to = new Date(t + hours * HOUR).toISOString();
  const past = t + hours * HOUR < Date.now();
  // Past windows never change, so keep them for a month.
  return query({ net__gte: from, net__lte: to }, `ll2:near:${from}:${hours}`, past ? 720 * HOUR : 0.5 * HOUR);
}

export function cachedLaunchesNear(when, hours = 12) {
  const t = new Date(when).getTime();
  const from = new Date(t - hours * HOUR).toISOString();
  const past = t + hours * HOUR < Date.now();
  return readCache(`ll2:near:${from}:${hours}`, past ? 720 * HOUR : 0.5 * HOUR);
}
