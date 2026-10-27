/**
 * A CSV field: quoted when it has to be, quotes doubled. Text a spreadsheet would run as a formula
 * (it starts with = + - @, a tab or a return) gets a leading apostrophe; numbers are left as they are.
 * Shared by the open data made at build time and the list exported from the app.
 */
export function csvField(v) {
  if (v == null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows of objects as CSV with a header line, in the order of `columns`. */
export const toCsvRows = (columns, rows) => `${[columns.join(','), ...rows.map((r) => columns.map((k) => csvField(r[k])).join(','))].join('\r\n')}\r\n`;
