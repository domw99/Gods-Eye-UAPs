/**
 * Minimal observable store. Everything the UI filters on lives here so the
 * list, globe, timeline and URL stay in sync.
 */
const listeners = new Set();

export const YEAR_MIN = 1900;
export const YEAR_MAX = new Date().getUTCFullYear();

export const state = {
  search: '',
  evidence: new Set(), // any-of
  status: new Set(), // any-of
  yearRange: null, // [from, to] or null for all
  sort: 'date-desc',
  layers: {
    cases: true,
    official: true,
    bluebook: false,
    nuforc: false,
    satellites: false,
    user: true,
  },
  selected: null, // item key
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(patch, reason = 'update') {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state, reason);
}

export function toggleIn(setName, value) {
  const set = new Set(state[setName]);
  set.has(value) ? set.delete(value) : set.add(value);
  update({ [setName]: set }, setName);
}

export function setLayer(name, on) {
  update({ layers: { ...state.layers, [name]: on } }, 'layers');
}

export function inYearRange(year) {
  if (!state.yearRange || year == null) return true;
  const [a, b] = state.yearRange;
  const y = Math.max(YEAR_MIN, year);
  return y >= a && y <= b;
}
