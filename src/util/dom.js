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
  return el;
}

let toastTimer;
export function toast(message, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
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
