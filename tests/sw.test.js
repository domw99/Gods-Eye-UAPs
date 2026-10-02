import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const PAGE = 'https://example.test/app/';

/** Run the service worker's script against a fake worker scope; returns what it registered. */
function loadWorker({ fetchImpl, saved = null }) {
  const handlers = {};
  const store = new Map(saved ? [[PAGE, saved]] : []);
  const at = (req) => (typeof req === 'string' ? new URL(req, PAGE).href : req.url);
  const caches = {
    match: async (req) => store.get(at(req)),
    open: async () => ({ put: async (req, res) => void store.set(at(req), res) }),
    keys: async () => [],
    delete: async () => true,
  };
  const scope = {
    self: { location: { origin: 'https://example.test' }, addEventListener: (type, fn) => (handlers[type] = fn), skipWaiting() {}, clients: { claim() {} } },
    caches,
    fetch: fetchImpl,
    URL,
    Promise,
    setTimeout: (...a) => setTimeout(...a),
  };
  vm.runInNewContext(SOURCE, scope);
  return { handlers, store };
}

function navigate(handlers) {
  const event = {
    request: { method: 'GET', mode: 'navigate', url: PAGE, headers: new Headers() },
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

  it('still saves a late answer for next time', async () => {
    vi.useFakeTimers();
    const { handlers, store } = loadWorker({ fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve(new Response('fresh')), 9_000)), saved: new Response('old') });
    navigate(handlers);
    await vi.advanceTimersByTimeAsync(9_500);
    expect(await store.get(PAGE).text()).toBe('fresh');
  });
});
