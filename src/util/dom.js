import { t, fill, translateDom } from '../i18n/index.js';

/** Tiny DOM helpers — no framework needed for a panel-driven console. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tagged template that escapes interpolations unless wrapped with raw(). */
const RAW = Symbol('raw');
export const raw = (html) => ({ [RAW]: String(html) });
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map((x) => (x && x[RAW] !== undefined ? x[RAW] : esc(x))).join('');
    else if (v && v[RAW] !== undefined) out += v[RAW];
    else if (v === false || v === null || v === undefined) out += '';
    else out += esc(v);
    out += strings[i + 1];
  });
  return raw(out);
}

export function mount(el, fragment) {
  el.innerHTML = fragment[RAW] ?? String(fragment);
  translateDom(el);
  return el;
}

const CONTROLS = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Where the keyboard focus is among the controls under `root` (-1: not in it), to find its place again after a redraw. */
export function focusPosition(root) {
  return [...root.querySelectorAll(CONTROLS)].indexOf(document.activeElement);
}

/** Put the focus back on the control at `position` under `root`, if it is still there. */
export function restoreFocus(root, position) {
  if (position >= 0) [...root.querySelectorAll(CONTROLS)][position]?.focus({ preventScroll: true });
}

/**
 * mount() for controls that redraw themselves when they are used (filter chips, layer
 * switches): the one that had the keyboard focus gets it again, instead of the page.
 */
export function remount(el, fragment) {
  const position = focusPosition(el);
  mount(el, fragment);
  restoreFocus(el, position);
  return el;
}

/** Translated markup: the key may hold tags (<b>…</b>); the {placeholders} are filled with escaped values. */
export function th(key, vars = {}) {
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v && v[RAW] !== undefined ? v[RAW] : esc(v)]));
  return raw(fill(t(key), safe));
}

let toastTimer;
export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = t(message);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Only allow http(s) links from data into href/src attributes. */
export function safeUrl(url) {
  try {
    const u = new URL(url, location.href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '#';
  } catch {
    return '#';
  }
}
