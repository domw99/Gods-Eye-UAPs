/**
 * GEIPAN: the UAP office of CNES, the French space agency, and the
 * longest-running government UAP office (since 1977). It publishes its case
 * files as CSV; scripts/build-geipan.mjs joins them, places each case at its commune
 * and writes public/data/geipan.json. Summaries are GEIPAN's own, in French.
 */
export const GEIPAN_SITE = 'https://www.cnes-geipan.fr/';
export const GEIPAN_SEARCH = 'https://www.cnes-geipan.fr/fr/recherche/cas';

/** GEIPAN's classification, with the app's status for the shared filters. */
export const GEIPAN_CLASSES = {
  A: {
    label: 'A · Identified',
    status: 'identified',
    long: 'Fully identified: GEIPAN found the cause beyond reasonable doubt.',
  },
  B: {
    label: 'B · Probably identified',
    status: 'explained',
    long: 'Probably identified: a known cause is very likely, though not certain.',
  },
  C: {
    label: 'C · Not enough information',
    status: 'unassessed',
    long: 'Cannot be identified: there is too little reliable information to reach any conclusion.',
  },
  D: {
    label: 'D · Unidentified',
    status: 'unresolved',
    long: 'Unidentified after investigation: the information is sufficient and reliable, yet no explanation was found.',
  },
  D1: {
    label: 'D1 · Unidentified',
    status: 'unresolved',
    long: 'Unidentified after investigation, with moderate strangeness and consistency.',
  },
  D2: {
    label: 'D2 · Unidentified, high strangeness',
    status: 'unresolved',
    long: 'Unidentified after investigation, with high strangeness and strong consistency.',
  },
};
export const classInfo = (cls) => GEIPAN_CLASSES[cls] || { label: cls || 'Unclassified', status: 'unassessed', long: 'No classification published.' };

/** Marker colours: unexplained cases stand out, identified ones recede. */
export const CLASS_COLORS = { A: '#6d7f9e', B: '#7f93b8', C: '#5f8bff', D: '#8fb4ff', D1: '#8fb4ff', D2: '#c4dcff' };
export const GEIPAN_COLOR = '#5f8bff';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Jul 1965", "Jul 1965" or "1965". */
export function geipanDate(r) {
  if (!r.year) return 'Date unknown';
  if (!r.month) return String(r.year);
  return `${r.day ? `${r.day} ` : ''}${MONTHS[r.month - 1]} ${r.year}`;
}

export const caseUrl = (r) => `https://www.cnes-geipan.fr/fr/cas/${encodeURIComponent(r.id)}`;

/** Google Translate of the French summary. The text is cut to keep the link short. */
export function translateUrl(text) {
  return `https://translate.google.com/?${new URLSearchParams({ sl: 'fr', tl: 'en', op: 'translate', text: text.slice(0, 1800) })}`;
}

/**
 * English names of the bodies a French summary names, for the sky chart's
 * highlights. "Mars" is also the month of March, so it needs "planète".
 */
const FRENCH_BODIES = [
  [/\bv[ée]nus\b/i, 'Venus'], [/\bjupiter\b/i, 'Jupiter'], [/\bsaturne\b/i, 'Saturn'], [/\bplan[èe]te mars\b/i, 'Mars'],
  [/\bmercure\b/i, 'Mercury'], [/\blune\b/i, 'Moon'], [/\bsirius\b/i, 'Sirius'], [/\barcturus\b/i, 'Arcturus'],
  [/\bv[ée]ga\b/i, 'Vega'], [/\bcapella\b/i, 'Capella'], [/\bcanopus\b/i, 'Canopus'],
];
export const bodiesNamed = (text) => FRENCH_BODIES.filter(([re]) => re.test(text)).map(([, name]) => name).join(' ');

/** Lower case without accents, so "evry" finds "Évry". */
export const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Unpack the compact JSON written by the build script. */
export function decodeGeipan(data) {
  const records = data.records.map(
    ([id, lat, lon, prec, place, zone, dept, year, month, day, utc, localTime, cls, witnesses, short, summary], index) => ({
      id, lat, lon, prec, place, zone, dept, year, month, day, utc, localTime,
      cls, witnesses, short, summary, index,
      status: classInfo(cls).status,
      search: fold(`${id} ${place} ${zone} ${short} ${summary}`),
    }),
  );
  return { meta: data, records, byId: new Map(records.map((r) => [r.id, r])) };
}

export async function loadGeipan(base) {
  const res = await fetch(`${base}data/geipan.json`);
  if (!res.ok) throw new Error(`geipan.json ${res.status}`);
  return decodeGeipan(await res.json());
}
