/**
 * The MUFON files: the Mutual UFO Network's monthly journal (Skylook from
 * 1967, the MUFON UFO Journal from 1976), released free by MUFON and The
 * Black Vault as "The MUFON Archive" and read here from the Internet Archive
 * mirror. public/data/mufon.json (scripts/build-mufon.mjs) lists the issues,
 * the places named in sighting reports and the pages about curated cases;
 * page text is fetched live from archive.org.
 */
export const MUFON_ITEM = 'MUFON_UFO_Journal_-_Skylook';
export const MUFON_LICENSE = 'https://creativecommons.org/licenses/by-nc-nd/4.0/';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "January 1978", "February–March 1968" or "1985" when the month is unknown. */
export function issueDate(is) {
  const m = MONTHS[is.month - 1];
  if (!m) return String(is.year);
  return is.monthTo ? `${m}–${MONTHS[is.monthTo - 1]} ${is.year}` : `${m} ${is.year}`;
}

/** "MUFON UFO Journal No. 122, January 1978"; other archives give "Vol. 26 No. 2". */
export const issueLabel = (is) =>
  `${is.title}${is.number ? (typeof is.number === 'number' ? ` No. ${is.number}` : ` ${is.number}`) : ''}, ${issueDate(is)}`;

/** Printed page number: most scans start with a one-page Black Vault cover sheet. */
export const pageNumber = (is, leaf) => (is.cover ? leaf : leaf + 1);

/*
 * An issue is either one PDF inside a shared item (the MUFON Journal: item
 * MUFON_ITEM, file = issue id) or an item of its own (item = file = id).
 */
const itemOf = (is) => is.item || MUFON_ITEM;
const fileOf = (is) => is.file || is.id;
const bookPath = (is) =>
  is.item && !is.sub ? encodeURIComponent(is.item) : `${encodeURIComponent(itemOf(is))}/${encodeURIComponent(fileOf(is))}`;
const download = (is, suffix) => `https://archive.org/download/${encodeURIComponent(itemOf(is))}/${encodeURIComponent(fileOf(is))}${suffix}`;

export const readerUrl = (is, leaf = 0) => `https://archive.org/details/${bookPath(is)}/page/n${leaf}/mode/1up`;
export const embedUrl = (is, leaf = 0) => `https://archive.org/embed/${bookPath(is)}/page/n${leaf}/mode/1up`;
export const pdfUrl = (is) => download(is, '.pdf');
export const itemUrl = (is = null) => `https://archive.org/details/${encodeURIComponent(is ? itemOf(is) : MUFON_ITEM)}`;

/** Unpack the compact JSON written by the build script. */
export function decodeMufon(data) {
  const issues = data.issues.map(([id, year, month, monthTo, number, title, pages, cover], index) => ({
    id, year, month, monthTo, number, title, pages, cover: !!cover, index,
  }));
  const records = data.places.map(([lat, lon, issue, leaf, place, quote], index) => ({
    lat, lon, issue, leaf, place: data.placeNames[place], quote, index,
    year: issues[issue].year, month: issues[issue].month,
  }));
  const byIssueId = new Map(issues.map((is) => [is.id, is]));
  return { meta: data, issues, records, byIssueId, cases: data.cases || {}, chapters: data.chapters || [] };
}

export async function loadMufon(base) {
  const res = await fetch(`${base}data/mufon.json`);
  if (!res.ok) throw new Error(`mufon.json ${res.status}`);
  return decodeMufon(await res.json());
}

/** Text of one page, from the issue's OCR search text and page index on archive.org. */
const textCache = new Map();
export async function pageText(is, leaf) {
  if (!textCache.has(is.id)) {
    textCache.set(
      is.id,
      (async () => {
        const get = async (suffix) => {
          const res = await fetch(download(is, suffix));
          if (!res.ok) throw new Error(`archive.org ${res.status}`);
          const buf = new Uint8Array(await res.arrayBuffer());
          // Gzip files arrive as raw bytes; some proxies decode them on the way.
          if (buf[0] !== 0x1f || buf[1] !== 0x8b) return new TextDecoder().decode(buf);
          const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
          return new Response(stream).text();
        };
        // Some scans have no page index; their djvu.xml marks every page instead.
        if (is.text === 'djvu') return { pages: djvuPages(await get('_djvu.xml')) };
        const [text, index] = await Promise.all([get('_hocr_searchtext.txt.gz'), get('_hocr_pageindex.json.gz')]);
        return { cps: Array.from(text), index: JSON.parse(index) };
      })().catch((e) => {
        textCache.delete(is.id);
        throw e;
      }),
    );
  }
  const { cps, index, pages } = await textCache.get(is.id);
  if (pages) return pages[leaf] || '';
  const span = index[leaf];
  return span ? cps.slice(span[0], span[1]).join('').trim() : '';
}

/** Page texts from a djvu.xml: one OBJECT per page, WORDs grouped in LINEs. */
export function djvuPages(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return [...doc.getElementsByTagName('OBJECT')].map((obj) =>
    [...obj.getElementsByTagName('LINE')]
      .map((line) => [...line.getElementsByTagName('WORD')].map((w) => w.textContent).join(' '))
      .join('\n')
      .trim(),
  );
}
