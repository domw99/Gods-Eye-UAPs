import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// Regression tests for the live-data services: each case here once gave a wrong answer.
const store = new Map();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i],
    get length() {
      return store.size;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const { weatherAt } = await import('../src/services/weather.js');
const { slimLaunch } = await import('../src/services/launches.js');
const { fetchWithTimeout, isTimeout } = await import('../src/util/net.js');
const { toArea, nearUS } = await import('../src/services/airspace.js');
const { searchJournals } = await import('../src/services/textsearch.js');
const { fold, decodeGeipan } = await import('../src/services/geipan.js');

/** An Open-Meteo answer for three days from 4 July 1965 whose temperature is the hour's position. */
function fakeOpenMeteo() {
  const calls = [];
  vi.stubGlobal('fetch', async (url) => {
    calls.push(String(url));
    const time = [];
    for (let h = 0; h < 72; h++) time.push(new Date(Date.UTC(1965, 6, 4 + Math.floor(h / 24), h % 24)).toISOString().slice(0, 16));
    return { ok: true, status: 200, json: async () => ({ elevation: 10, hourly: { time, temperature_2m: time.map((_, i) => i) } }) };
  });
  return calls;
}

describe('weather at the time of a sighting', () => {
  it('keeps one cached entry per hour that is read, not per clock hour', async () => {
    const calls = fakeOpenMeteo();
    const late = await weatherAt(45.5, -100.25, new Date('1965-07-05T12:40:00Z')); // reads 13:00
    const early = await weatherAt(45.5, -100.25, new Date('1965-07-05T12:10:00Z')); // reads 12:00
    expect(late.hour).toBe('1965-07-05T13:00Z');
    expect(early.hour).toBe('1965-07-05T12:00Z');
    expect(early.temperature_2m).toBe(late.temperature_2m - 1);
    expect(calls).toHaveLength(2);
    // The same hour is still served from the cache.
    expect((await weatherAt(45.5, -100.25, new Date('1965-07-05T13:20:00Z'))).hour).toBe('1965-07-05T13:00Z');
    expect(calls).toHaveLength(2);
  });

  it('reads the earlier hour when a sighting falls exactly half-way, as nearestHourIndex does', async () => {
    fakeOpenMeteo();
    expect((await weatherAt(10, 10, new Date('1965-07-05T12:30:00Z'))).hour).toBe('1965-07-05T12:00Z');
  });

  it('never asks the archive for a day before it starts (1940-01-01), which it rejects', async () => {
    const calls = [];
    vi.stubGlobal('fetch', async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ hourly: { time: ['1940-01-01T00:00'], temperature_2m: [3] } }) };
    });
    const wx = await weatherAt(48.8, 2.3, new Date('1940-01-01T00:30:00Z'));
    expect(new URL(calls[0]).searchParams.get('start_date')).toBe('1940-01-01');
    expect(wx.temperature_2m).toBe(3);
  });
});

describe('live requests', () => {
  it('give up on a stalled connection instead of waiting for ever', async () => {
    vi.stubGlobal('fetch', (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
    const error = await fetchWithTimeout('https://example.test/', {}, 20).catch((e) => e);
    expect(isTimeout(error)).toBe(true);
  });

  it('are made with a time limit, and a timed-out weather request is not asked twice', async () => {
    const signals = [];
    vi.stubGlobal('fetch', async (url, options) => {
      signals.push(options?.signal);
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    await expect(weatherAt(48.8, 2.3, new Date('1965-07-05T12:00:00Z'))).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });
});

describe('launches', () => {
  it('leaves a pad without coordinates unplaced instead of putting it at 0°, 0°', () => {
    expect(slimLaunch({ pad: { latitude: null, longitude: null } })).toMatchObject({ lat: null, lon: null });
    expect(slimLaunch({ pad: { latitude: '', longitude: '' } })).toMatchObject({ lat: null, lon: null });
    expect(slimLaunch({ pad: { latitude: 28.6, longitude: null } })).toMatchObject({ lat: null, lon: null });
    expect(slimLaunch({})).toMatchObject({ lat: null, lon: null });
    expect(slimLaunch({ pad: { latitude: '0', longitude: '0' } })).toMatchObject({ lat: 0, lon: 0 }); // a real pad on the equator
    expect(slimLaunch({ pad: { latitude: 5.23, longitude: -52.77 } })).toMatchObject({ lat: 5.23, lon: -52.77 });
  });
});

describe('journal search', () => {
  it('treats a query word that is also an Object property as an ordinary missing word', async () => {
    const files = {
      'meta.json': { shards: ['c', 'z'], archives: [{ key: 'mufon', issuePages: [5] }], pages: 5, maxPages: 5, common: [] },
      'c.json': { cattle: '1,2' },
      'z.json': { zamora: '0,1' },
    };
    vi.stubGlobal('fetch', async (url) => ({ ok: true, status: 200, json: async () => files[String(url).split('/').pop()] }));
    const r = await searchJournals('/base/', 'constructor');
    expect(r.missing).toEqual(['constructor']);
    expect(r.hits).toEqual([]);
    expect((await searchJournals('/base/', 'cattle')).hits.map((h) => h.leaf)).toEqual([1, 3]);
  });
});

describe('GEIPAN search folding', () => {
  it('spells out ligatures so "oe" finds "œ"', () => {
    expect(fold('Sallebœuf')).toBe('salleboeuf');
    expect(fold('Cœur d’Œuvre Æsir')).toBe('coeur d’oeuvre aesir');
    expect(fold('Évry')).toBe('evry');
    const [r] = decodeGeipan({ records: [['id1', 49, 2, 0, 'Sallebœuf', '', '33', 1999, 1, 1, null, null, 'D', 1, 'short', 'summary']] }).records;
    expect(r.search).toContain(fold('salleboeuf'));
  });
});

describe('airspace pre-check', () => {
  it('covers every area in the bundled data (the Arctic warning areas reach 82°N)', () => {
    const areas = JSON.parse(readFileSync('public/data/airspace.json', 'utf8')).features.map(toArea);
    const outside = areas.filter((a) => !nearUS((a.bbox[1] + a.bbox[3]) / 2, (a.bbox[0] + a.bbox[2]) / 2));
    expect(outside.map((a) => a.name)).toEqual([]);
  });
});
