import { describe, it, expect, beforeEach } from 'vitest';
import { setCached, dropCaches } from '../src/util/storage.js';

/** A localStorage that holds only `limit` characters, like a full quota. */
function fakeStorage(limit) {
  const data = new Map();
  const size = () => [...data.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const api = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      const used = size() - (data.has(k) ? k.length + data.get(k).length : 0);
      if (used + k.length + v.length > limit) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
    key: (i) => [...data.keys()][i],
    get length() {
      return data.size;
    },
  };
  return new Proxy(api, { ownKeys: () => [...data.keys()], getOwnPropertyDescriptor: (_, k) => (data.has(k) ? { enumerable: true, configurable: true, value: data.get(k) } : undefined) });
}

describe('storage helper', () => {
  beforeEach(() => {
    globalThis.localStorage = fakeStorage(200);
  });

  it('stores a cache entry when there is room', () => {
    expect(setCached('wx:a', 'x'.repeat(50))).toBe(true);
    expect(localStorage.getItem('wx:a')).toHaveLength(50);
  });

  it('drops weather and launch caches, but never the user’s own data, when the quota is full', () => {
    localStorage.setItem('gods-eye-uap:starred', '["case:a"]');
    localStorage.setItem('wx:1', 'y'.repeat(70));
    localStorage.setItem('ll2:near:2', 'z'.repeat(70));
    expect(setCached('wx:new', 'n'.repeat(60))).toBe(true);
    expect(localStorage.getItem('gods-eye-uap:starred')).toBe('["case:a"]');
    expect(localStorage.getItem('wx:1')).toBeNull();
    expect(localStorage.getItem('wx:new')).toHaveLength(60);
  });

  it('gives up cleanly when even an empty cache cannot hold it', () => {
    expect(setCached('wx:huge', 'h'.repeat(500))).toBe(false);
  });

  it('dropCaches leaves other keys alone', () => {
    localStorage.setItem('gods-eye-uap:lang', 'es');
    localStorage.setItem('ll2:window:14:30', 'abc');
    dropCaches();
    expect(localStorage.getItem('gods-eye-uap:lang')).toBe('es');
    expect(localStorage.getItem('ll2:window:14:30')).toBeNull();
  });
});
