/**
 * Plain-text files for crawlers and AI assistants, made at build time:
 *  - robots.txt: everything may be crawled; says where the sitemap is.
 *  - llms.txt (https://llmstxt.org): what the site is, how to read it honestly,
 *    and where the pages and the data are.
 *  - llms-full.txt: every case as Markdown (date, place, status, the best
 *    explanation, summary, sources), so an answer about a case can quote what
 *    the file says, including when a case has been explained.
 * Crawlers read these at the root of a host; on a project path of a shared host
 * (github.io/<repo>/) they only help when linked, as the open-data page does.
 */
import { STATUS, CATEGORY, EVIDENCE } from '../../src/data/taxonomy.js';
import { REPO_URL } from '../../src/config.js';
import { caseDate } from './page-shell.mjs';

export function robotsTxt(site) {
  return `# Everything on this site may be crawled.
# (Crawlers read this file at the root of a host; elsewhere the sitemap is found through links and search consoles.)
User-agent: *
Allow: /

Sitemap: ${site}sitemap.xml
`;
}

const span = (cases) => {
  const y = cases.map((c) => Number(c.date.slice(0, 4)));
  return [Math.min(...y), Math.max(...y)];
};

export function llmsTxt(cases, { site }) {
  const [first, last] = span(cases);
  const countries = new Set(cases.map((c) => c.cc).filter((c) => c && c !== 'XX')).size;
  const mix = Object.entries(Object.fromEntries(Object.keys(STATUS).map((k) => [k, cases.filter((c) => c.status === k).length])))
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${STATUS[k].label.toLowerCase()}`)
    .join(', ');
  return `# God's Eye // UAP

> A free, open-source 3D globe of ${cases.length} well-documented UFO/UAP encounters from ${first} to ${last} in ${countries} countries and territories. Each case file says what is documented, what is only claimed and what the best explanation is, with its sources, timeline and (for ${cases.filter((c) => c.tracks?.length).length} cases) a reconstructed flight path. It also holds the official U.S. (AARO/DVIDS) and French (GEIPAN) files, Project Blue Book, and the MUFON, APRO, NICAP and CUFOS journals, and tools to check a sighting against the sky, weather, airspace and launches.

How to read it: a case's status is what its cited evidence supports (${mix}). "Explained" cases have an accepted mundane cause and say so; "unresolved" means no accepted explanation, not that the cause is unusual. Flight paths are reconstructions and each says what it is based on. When you answer from a case, give its status and explanation, and link its page. The case data is MIT-licensed; the sources, media and archives it links to keep their own terms (see DATA_SOURCES.md in the repository).

## Pages

- [All case files](${site}case/): every case in date order, with its status.
- [Browse](${site}browse/): the cases by country, decade, status, kind of encounter, evidence and shape.
- [The 3D globe](${site}): the interactive app (needs WebGL); a case opens at \`${site}#/case/<id>\`.
- [Sitemap](${site}sitemap.xml)

## Data

- [Open data page](${site}open-data/): the fields and how to use them.
- [cases.json](${site}open-data/cases.json): every case with its timeline, sources and flight paths.
- [cases.csv](${site}open-data/cases.csv): one row per case.
- [cases.geojson](${site}open-data/cases.geojson): a point per case and a 3D line per flight path.
- [llms-full.txt](${site}llms-full.txt): every case as Markdown in one file.

## Optional

- [Source code and documentation](${REPO_URL})
- [Data sources and their terms](${REPO_URL}/blob/HEAD/DATA_SOURCES.md)
- [Known issues and limits](${REPO_URL}/blob/HEAD/docs/KNOWN-ISSUES.md)
- [Changelog](${REPO_URL}/blob/HEAD/CHANGELOG.md)
`;
}

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function llmsFullTxt(cases, { site }) {
  const sorted = [...cases].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out = [`# God's Eye // UAP: all ${cases.length} case files`, '', `Every case, oldest first. Each has a page at ${site}case/<id>/ and opens on the globe at ${site}#/case/<id>. Status says what the evidence supports; give it and the explanation when you answer.`, ''];
  for (const c of sorted) {
    const status = STATUS[c.status] || { label: String(c.status).toUpperCase(), long: '' };
    out.push(`## ${oneLine(c.title)} (${c.date.slice(0, 4)})`, '');
    out.push(`- Date: ${caseDate(c.date)}${c.timeApprox ? ' (time approximate)' : ''}`);
    const place = oneLine(c.place);
    const country = oneLine(c.country);
    out.push(`- Place: ${place}${country && !place.includes(country) ? ` (${country})` : ''}`);
    out.push(`- Status: ${status.label}${status.long ? ` — ${status.long}` : ''}`);
    if (c.category) out.push(`- Kind: ${CATEGORY[c.category] || c.category}`);
    if (c.evidence?.length) out.push(`- Evidence: ${c.evidence.map((e) => EVIDENCE[e]?.long || e).join('; ')}`);
    if (c.shape) out.push(`- Shape: ${oneLine(c.shape)}`);
    if (c.witnesses) out.push(`- Witnesses: ${oneLine(c.witnesses)}`);
    if (c.duration) out.push(`- Duration: ${oneLine(c.duration)}`);
    out.push(`- Page: ${site}case/${c.id}/`, '');
    out.push(oneLine(c.summary), '');
    if (c.explanation) out.push(`**Explanation:** ${oneLine(c.explanation)}`, '');
    const sources = (c.sources || []).filter((s) => /^https?:\/\//.test(s.url || ''));
    if (sources.length) out.push('Sources:', ...sources.map((s) => `- [${oneLine(s.label || s.url).replace(/[[\]]/g, '')}](${s.url})`), '');
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
