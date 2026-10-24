import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const PAGE = 'https://example.test/app/';

/** Run the service worker's script against a fake worker scope; returns what it registered. */
function loadWorker({ fetchImpl, saved = null, cacheNames = [], deleted = [] }) {
  const handlers = {};
  const store = new Map(saved ? [[PAGE, saved]] : []);
  const at = (req) => (typeof req === 'string' ? new URL(req, PAGE).href : req.url);
  const caches = {
    match: async (req) => store.get(at(req)),
    open: async () => ({ put: async (req, res) => void store.set(at(req), res) }),
    keys: async () => cacheNames,
    delete: async (name) => deleted.push(name) > 0,
  };
  const scope = {
    self: { location: { origin: 'https://example.test', href: `${PAGE}sw.js` }, addEventListener: (type, fn) => (handlers[type] = fn), skipWaiting() {}, clients: { claim() {} } },
    caches,
    fetch: fetchImpl,
    URL,
    Promise,
    setTimeout: (...a) => setTimeout(...a),
  };
  vm.runInNewContext(SOURCE, scope);
  return { handlers, store };
}

function navigate(handlers, url = PAGE) {
  const event = {
    request: { method: 'GET', mode: 'navigate', url, headers: new Headers() },
    answer: null,
    respondWith(p) {
      this.answer = p;
    },
    waitUntil() {},
  };
  handlers.fetch(event);
  return event.answer;
}

const text = async (promise) => (await promise).text();

afterEach(() => vi.useRealTimers());

describe('service worker: opening the app', () => {
  it('shows the live page when the network answers', async () => {
    const { handlers } = loadWorker({ fetchImpl: async () => new Response('live'), saved: new Response('saved') });
    expect(await text(navigate(handlers))).toBe('live');
  });

  it('shows the saved page when the network is down', async () => {
    const { handlers } = loadWorker({ fetchImpl: async () => Promise.reject(new TypeError('offline')), saved: new Response('saved') });
    expect(await text(navigate(handlers))).toBe('saved');
  });

  it('fails as before when the network is down and nothing is saved', async () => {
    const { handlers } = loadWorker({ fetchImpl: async () => Promise.reject(new TypeError('offline')) });
    await expect(navigate(handlers)).rejects.toThrow('offline');
  });

  it('shows the saved page instead of waiting on a slow network', async () => {
    vi.useFakeTimers();
    const { handlers } = loadWorker({ fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve(new Response('live')), 60_000)), saved: new Response('saved') });
    const answer = navigate(handlers);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await text(answer)).toBe('saved');
  });

  it('keeps waiting when the network is slow and nothing is saved', async () => {
    vi.useFakeTimers();
    const { handlers } = loadWorker({ fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve(new Response('live')), 20_000)) });
    const answer = navigate(handlers);
    await vi.advanceTimersByTimeAsync(20_001);
    expect(await text(answer)).toBe('live');
  });

  it('waits for a case page on a slow network rather than showing the app in its place', async () => {
    vi.useFakeTimers();
    // The app is saved, the case page is not: the app must not stand in for it at the case page's address.
    const { handlers } = loadWorker({ fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve(new Response('case page')), 20_000)), saved: new Response('saved app') });
    const answer = navigate(handlers, `${PAGE}case/roswell-1947/`);
    await vi.advanceTimersByTimeAsync(20_001);
    expect(await text(answer)).toBe('case page');
  });

  it('still saves a late answer for next time', async () => {
    vi.useFakeTimers();
    const { handlers, store } = loadWorker({ fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve(new Response('fresh')), 9_000)), saved: new Response('old') });
    navigate(handlers);
    await vi.advanceTimersByTimeAsync(9_500);
    expect(await store.get(PAGE).text()).toBe('fresh');
  });
});

describe('service worker: cleaning up old caches', () => {
  it('removes the caches of earlier versions but keeps the satellite element sets', async () => {
    const deleted = [];
    const { handlers } = loadWorker({
      fetchImpl: async () => new Response(''),
      cacheNames: ['gods-eye-pages-v0', 'gods-eye-files-v0', 'gods-eye-pages-v1', 'gods-eye-files-v1', 'gods-eye-uap-tle'],
      deleted,
    });
    let done;
    handlers.activate({ waitUntil: (p) => (done = p) });
    await done;
    expect(deleted.sort()).toEqual(['gods-eye-files-v0', 'gods-eye-pages-v0']);
  });
});

describe('service worker: refreshing saved files in the background', () => {
  const FILE = `${PAGE}cesium/Cesium.js`;
  function get(handlers, url = FILE) {
    const event = {
      request: { method: 'GET', mode: 'no-cors', url, headers: new Headers() },
      answer: null,
      respondWith(p) {
        this.answer = p;
      },
    };
    handlers.fetch(event);
    return event.answer;
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  it('serves the saved copy and does not store an unchanged file again', async () => {
    const saved = new Response('v1', { headers: { etag: '"a"' } });
    const { handlers, store } = loadWorker({ fetchImpl: async () => new Response('v1', { headers: { etag: '"a"' } }) });
    store.set(FILE, saved);
    expect(await text(get(handlers))).toBe('v1');
    await settle();
    expect(store.get(FILE)).toBe(saved);
  });

  it('stores a changed file for next time', async () => {
    const { handlers, store } = loadWorker({ fetchImpl: async () => new Response('v2', { headers: { etag: '"b"' } }) });
    store.set(FILE, new Response('v1', { headers: { etag: '"a"' } }));
    expect(await text(get(handlers))).toBe('v1');
    await settle();
    expect(await store.get(FILE).text()).toBe('v2');
  });

  it('compares the modified date when there is no ETag, and stores when it cannot tell', async () => {
    const date = 'Sat, 24 Oct 2026 10:00:00 GMT';
    const same = loadWorker({ fetchImpl: async () => new Response('v1', { headers: { 'last-modified': date } }) });
    const saved = new Response('v1', { headers: { 'last-modified': date } });
    same.store.set(FILE, saved);
    await get(same.handlers);
    await settle();
    expect(same.store.get(FILE)).toBe(saved);

    const unknown = loadWorker({ fetchImpl: async () => new Response('v2') });
    unknown.store.set(FILE, new Response('v1'));
    await get(unknown.handlers);
    await settle();
    expect(await unknown.store.get(FILE).text()).toBe('v2');
  });

  it('stores a file seen for the first time', async () => {
    const { handlers, store } = loadWorker({ fetchImpl: async () => new Response('v1', { headers: { etag: '"a"' } }) });
    expect(await text(get(handlers))).toBe('v1');
    await settle();
    expect(store.has(FILE)).toBe(true);
  });
});
