/**
 * Research archives: the journals of APRO, NICAP and CUFOS and MUFON's
 * chapter newsletters, as scanned on the Internet Archive.
 * public/data/journals.json (scripts/build-journals.mjs) lists the issues,
 * the places named in sighting reports and the pages about curated cases.
 * Issues share the MUFON journal's shape, so the page links and page text
 * in services/mufon.js work for both.
 */
export const JOURNALS_COLOR = '#3fd4b0';

/** Short labels for badges and hover text. */
export const SERIES_SHORT = { apro: 'APRO', nicap: 'NICAP', iur: 'CUFOS', chapters: 'MUFON CHAPTER' };

/** Where each series lives, for the source list. */
export const SERIES_LINKS = {
  apro: { label: 'APRO Bulletin, Archives for the Unexplained scans', url: 'https://archive.org/search?query=collection%3Aufonewsletters+AND+title%3A%28APRO+Bulletin%29' },
  nicap: { label: 'The U.F.O. Investigator (NICAP), Serials in Microfilm', url: 'https://archive.org/details/pub_u-f-o-investigator' },
  iur: { label: 'International UFO Reporter (CUFOS) collection', url: 'https://archive.org/details/iur-vol.-31-no.-4' },
  chapters: { label: 'MUFON chapter newsletters, Archives for the Unexplained', url: 'https://archive.org/search?query=collection%3Aufonewsletters+AND+title%3A%28MUFON%29' },
};

/** Unpack the compact JSON written by the build script. */
export function decodeJournals(data) {
  const issues = data.issues.map(([id, series, item, file, sub, text, year, month, monthTo, number, title, pages], index) => ({
    id, series, item, file, sub: !!sub, text, year, month, monthTo, number, title, pages, cover: false, index,
  }));
  const records = data.places.map(([lat, lon, issue, leaf, place, quote], index) => ({
    lat, lon, issue, leaf, place: data.placeNames[place], quote, index,
    year: issues[issue].year, month: issues[issue].month, series: issues[issue].series,
  }));
  const byIssueId = new Map(issues.map((is) => [is.id, is]));
  return { meta: data, series: data.series, issues, records, byIssueId, cases: data.cases || {} };
}

export async function loadJournals(base) {
  const res = await fetch(`${base}data/journals.json`);
  if (!res.ok) throw new Error(`journals.json ${res.status}`);
  return decodeJournals(await res.json());
}
