/**
 * Place names typed into the search box, looked up with Photon (komoot's
 * OpenStreetMap geocoder; no key). A stalled lookup gives up after a few
 * seconds, so the list says the search could not be reached instead of
 * waiting silently; typed coordinates never need it (app/coords.js).
 */
export const PLACES_URL = 'https://photon.komoot.io/api/';
export const PLACES_TIMEOUT_MS = 6000;

export const placesUrl = (q, limit = 3) => `${PLACES_URL}?${new URLSearchParams({ q, limit: String(limit), lang: 'en' })}`;

/** Photon's GeoJSON as the rows the list shows; features without a usable point are dropped. */
export function readPlaces(json) {
  return (json?.features || [])
    .map((f) => {
      const [lon, lat] = f?.geometry?.coordinates || [];
      const p = f?.properties || {};
      const extent = Array.isArray(p.extent) && p.extent.length === 4 && p.extent.every(Number.isFinite) ? p.extent : null; // [west, north, east, south]
      return { name: p.name || [p.city, p.country].filter(Boolean).join(', '), detail: [p.state, p.country].filter(Boolean).join(', '), lon, lat, extent };
    })
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
}

/** The caller's signal (a newer search cancels this one) and a time limit, as one signal. */
function withTimeout(signal, ms) {
  if (typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return signal; // an old browser: no limit, as before
  const timer = AbortSignal.timeout(ms);
  if (!signal) return timer;
  if (AbortSignal.any) return AbortSignal.any([signal, timer]);
  return signal;
}

/**
 * Up to three places for `q`. Rejects with an AbortError when `signal` cancels it (a newer search), and
 * with a TimeoutError (see util/net.js isTimeout) or a network error when Photon does not answer.
 */
export async function searchPlaces(q, { signal, ms = PLACES_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(placesUrl(q), { signal: withTimeout(signal, ms) });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  return readPlaces(await res.json());
}
