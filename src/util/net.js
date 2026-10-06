/**
 * fetch() that gives up after `ms`, so a stalled connection to a public API
 * ends in the usual "could not be reached" message instead of a loading line
 * that never changes. The body is covered too (res.json() rejects on timeout).
 */
export const FETCH_TIMEOUT_MS = 20000;

export function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  if (typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return fetch(url, options); // an old browser: no timeout, as before
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

/** Did this error come from fetchWithTimeout() giving up? */
export const isTimeout = (error) => error?.name === 'TimeoutError';
