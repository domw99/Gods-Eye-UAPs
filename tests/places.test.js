import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { searchPlaces, readPlaces, placesUrl, PLACES_TIMEOUT_MS } from '../src/services/places.js';
import { isTimeout } from '../src/util/net.js';

const feature = (name, lon, lat, extra = {}) => ({ geometry: { coordinates: [lon, lat] }, properties: { name, country: 'United States', state: 'New Mexico', ...extra } });

describe('place search (Photon)', () => {
  it('asks for three places by name', () => {
    const u = new URL(placesUrl('Roswell'));
    expect(u.origin + u.pathname).toBe('https://photon.komoot.io/api/');
    expect(u.searchParams.get('q')).toBe('Roswell');
    expect(u.searchParams.get('limit')).toBe('3');
  });

  it('reads the places, keeping a usable extent and dropping rows with no point or name', () => {
    const rows = readPlaces({
      features: [
        feature('Roswell', -104.523, 33.3943, { extent: [-104.6, 33.45, -104.45, 33.3] }),
        feature('Broken', 'x', 1),
        feature('', -100, 30, { city: '', country: '' }),
        feature('Off the map', 200, 30),
        feature('Bad extent', -100, 30, { extent: [1, 2] }),
        { properties: { name: 'No geometry' } },
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(['Roswell', 'Bad extent']);
    expect(rows[0]).toMatchObject({ detail: 'New Mexico, United States', lat: 33.3943, lon: -104.523, extent: [-104.6, 33.45, -104.45, 33.3] });
    expect(rows[1].extent).toBeNull();
    expect(readPlaces(null)).toEqual([]);
    expect(readPlaces({})).toEqual([]);
  });

  it('gives up on a lookup that does not answer, as a timeout the list can report', async () => {
    // A fetch that never answers on its own, only when its signal gives up.
    const stalled = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    const error = await searchPlaces('Roswell', { ms: 20, fetchImpl: stalled }).catch((e) => e);
    expect(isTimeout(error)).toBe(true);
    expect(PLACES_TIMEOUT_MS).toBeLessThanOrEqual(10_000); // a person is waiting on the list
  });

  it('is cancelled by a newer search, which the list ignores', async () => {
    const stalled = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    const ctl = new AbortController();
    const pending = searchPlaces('Roswell', { signal: ctl.signal, fetchImpl: stalled }).catch((e) => e);
    ctl.abort();
    expect((await pending).name).toBe('AbortError');
  });

  it('reports a refused lookup as an error', async () => {
    const refused = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(searchPlaces('Roswell', { fetchImpl: refused })).rejects.toThrow(/Photon 503/);
    const fine = async () => ({ ok: true, json: async () => ({ features: [feature('Roswell', -104.523, 33.3943)] }) });
    expect((await searchPlaces('Roswell', { fetchImpl: fine }))[0].name).toBe('Roswell');
  });

  it('is what the search box uses, and it says so when Photon cannot be reached', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).toContain('searchPlaces(q, { signal: placeAbort.signal })');
    expect(main).not.toContain('photon.komoot.io'); // one place asks Photon, with its time limit
    expect(main).toContain("t('Place search could not be reached; coordinates typed here still work.')");
  });
});
