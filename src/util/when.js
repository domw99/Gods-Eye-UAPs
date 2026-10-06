import { t, locale } from '../i18n/index.js';

/** Dates for the panels, in the interface language. */
export const fmtDate = (d, opts = {}) =>
  d.toLocaleString(locale(), { year: 'numeric', month: 'short', day: 'numeric', ...opts });

/** "13 Mar 1997, 19:55 local (UTC−07:00) · 02:55 UTC" from an ISO string with offset. */
export function localAndUtc(iso, approx = false) {
  if (approx) return `${localAndUtc(iso).replace(/(\d{2}:\d{2})/, '~$1').replace(/\s*· \d{2}:\d{2} UTC$/, '')} · ${t('time of day approximate')}`;
  const d = new Date(iso);
  const m = iso.match(/T(\d{2}):(\d{2}).*([+-]\d{2}):?(\d{2})$/);
  const utc = `${d.toISOString().slice(11, 16)} UTC`;
  if (!m) return `${fmtDate(d, { timeZone: 'UTC' })} · ${utc}`;
  const offMin = (m[3].startsWith('-') ? -1 : 1) * (Math.abs(+m[3]) * 60 + +m[4]);
  const local = new Date(d.getTime() + offMin * 60000);
  const day = fmtDate(local, { timeZone: 'UTC' });
  const off = `UTC${offMin < 0 ? '−' : '+'}${m[3].replace(/^[+-]/, '')}:${m[4]}`;
  return t('{day}, {time} local ({off}) · {utc}', { day, time: `${m[1]}:${m[2]}`, off, utc });
}
