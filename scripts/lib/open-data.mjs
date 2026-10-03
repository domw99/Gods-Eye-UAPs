/**
 * The case files as open data, made at build time into open-data/: JSON (every
 * field, with the reconstructed flight paths), CSV (one row per case) and
 * GeoJSON (a point per case, a line per flight path), and a page describing
 * them with schema.org Dataset markup, so dataset search engines list it.
 */
import { STATUS, CATEGORY, PRECISION, TRACK_BASIS } from '../../src/data/taxonomy.js';
import { AUTHOR, AUTHOR_URL, REPO_URL } from '../../src/config.js';
import { esc, ldJson } from './case-pages.mjs';

const wikiUrl = (title) => (title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null);

/** One case as an open-data record. */
export function caseRecord(c, { site }) {
  return {
    id: c.id,
    title: c.title,
    date: c.date,
    year: Number(c.date.slice(0, 4)),
    place: c.place,
    country: c.country ?? null,
    countryCode: c.cc ?? null,
    latitude: c.lat ?? null,
    longitude: c.lon ?? null,
    locationPrecision: c.precision ?? null,
    category: c.category,
    categoryLabel: CATEGORY[c.category] ?? null,
    status: c.status,
    statusLabel: STATUS[c.status]?.long ?? null,
    explanation: c.explanation ?? null,
    evidence: c.evidence ?? [],
    shape: c.shape ?? null,
    witnesses: c.witnesses ?? null,
    duration: c.duration ?? null,
    summary: c.summary,
    timeline: (c.timeline || []).map(({ t, text }) => ({ time: t, text })),
    tracks: (c.tracks || []).map((tr) => ({
      id: tr.id,
      label: tr.label,
      kind: tr.kind,
      basis: tr.basis,
      points: tr.points.map(([lon, lat, altitudeM, seconds, note]) => ({ longitude: lon, latitude: lat, altitudeM, seconds, note: note ?? null })),
    })),
    wikipedia: wikiUrl(c.wiki),
    sources: (c.sources || []).map(({ label, url, kind }) => ({ label, url, kind: kind ?? null })),
    page: `${site}case/${c.id}/`,
    globe: `${site}#/case/${c.id}`,
  };
}

const CSV_COLUMNS = [
  'id', 'title', 'date', 'year', 'place', 'country', 'countryCode', 'latitude', 'longitude', 'locationPrecision',
  'category', 'status', 'statusLabel', 'explanation', 'evidence', 'shape', 'witnesses', 'duration', 'summary',
  'tracks', 'wikipedia', 'sources', 'page', 'globe',
];

/** A CSV field: quoted when it has to be, quotes doubled. */
export function csvField(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** All records as CSV, one row per case. Lists are joined with " | "; the flight paths are only counted (they are in the JSON and GeoJSON). */
export function toCsv(records) {
  const cell = (r, k) => {
    if (k === 'evidence') return r.evidence.join(' | ');
    if (k === 'tracks') return r.tracks.length;
    if (k === 'sources') return r.sources.map((s) => s.url).join(' | ');
    return r[k];
  };
  return `${[CSV_COLUMNS.join(','), ...records.map((r) => CSV_COLUMNS.map((k) => csvField(cell(r, k))).join(','))].join('\r\n')}\r\n`;
}

/** A GeoJSON FeatureCollection: a point for each placed case and a line for each flight path. */
export function toGeoJson(records) {
  const features = [];
  for (const r of records) {
    if (r.latitude != null && r.longitude != null)
      features.push({
        type: 'Feature',
        id: r.id,
        geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
        properties: {
          id: r.id, title: r.title, date: r.date, year: r.year, place: r.place, countryCode: r.countryCode,
          locationPrecision: r.locationPrecision, category: r.category, status: r.status, evidence: r.evidence.join(', '),
          shape: r.shape, summary: r.summary, explanation: r.explanation, page: r.page, globe: r.globe,
        },
      });
    for (const tr of r.tracks)
      if (tr.points.length > 1)
        features.push({
          type: 'Feature',
          id: `${r.id}/${tr.id}`,
          geometry: { type: 'LineString', coordinates: tr.points.map((p) => [p.longitude, p.latitude, p.altitudeM]) },
          properties: { case: r.id, title: r.title, track: tr.id, label: tr.label, kind: tr.kind, basis: tr.basis, seconds: tr.points.map((p) => p.seconds) },
        });
  }
  return { type: 'FeatureCollection', features };
}

/** Everything for open-data/: the three files and the page describing them. */
export function openData(cases, { site, version, date }) {
  const records = [...cases].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((c) => caseRecord(c, { site }));
  const url = `${site}open-data/`;
  const years = records.map((r) => r.year);
  const countries = new Set(records.map((r) => r.countryCode).filter(Boolean)).size;
  const withTracks = records.filter((r) => r.tracks.length).length;
  const meta = {
    name: "God's Eye // UAP case files",
    version,
    generated: date,
    cases: records.length,
    licence: 'MIT (see the repository LICENSE); linked media and archives keep their own licences',
    source: REPO_URL,
    site,
  };
  const json = `${JSON.stringify({ ...meta, records }, null, 1)}\n`;
  const csv = toCsv(records);
  const geojson = `${JSON.stringify({ ...toGeoJson(records), metadata: meta })}\n`;
  const description = `${records.length} well-documented UFO/UAP encounters from ${Math.min(...years)} to ${Math.max(...years)} in ${countries} countries. For each: the date and place with coordinates, the kind of encounter, the evidence, the official or best explanation and its status, a short summary and timeline, and the sources. ${withTracks} cases have reconstructed flight paths, each marked with what it is based on (radar, an official report, witness reports or an approximate reconstruction). Made for the God's Eye // UAP 3D globe.`;
  const files = [
    { name: 'cases.json', format: 'application/json', what: 'Every field, with the flight paths and timelines.' },
    { name: 'cases.csv', format: 'text/csv', what: 'One row per case, for spreadsheets. Lists are joined with “ | ”; flight paths are counted, not included.' },
    { name: 'cases.geojson', format: 'application/geo+json', what: 'A point per case and a 3D line per flight path, for GIS tools and web maps.' },
  ];
  const fields = [
    ['id', 'Stable identifier; the case page is case/<id>/'],
    ['date', 'Local date and time with its UTC offset, as recorded (ISO 8601)'],
    ['place, country, countryCode', 'Where it happened; ISO 3166-1 alpha-2 country code'],
    ['latitude, longitude, locationPrecision', `WGS 84 degrees; how exact the position is: ${Object.keys(PRECISION).join(', ')}`],
    ['category', `The kind of encounter: ${Object.keys(CATEGORY).join(', ')}`],
    ['status, statusLabel, explanation', `What is known about the cause: ${Object.keys(STATUS).join(', ')}`],
    ['evidence', 'The kinds of evidence on record (video, radar, official documents, witnesses…)'],
    ['shape, witnesses, duration, summary, timeline', 'What was seen, by whom, for how long, and in what order'],
    ['tracks', `Reconstructed flight paths: [longitude, latitude, altitude in metres, seconds from the start]; basis: ${Object.keys(TRACK_BASIS).join(', ')}`],
    ['sources, wikipedia', 'Where the facts come from'],
    ['page, globe', 'The case page, and the case on the 3D globe'],
  ];
  const structured = {
    '@context': 'https://schema.org/',
    '@type': 'Dataset',
    name: meta.name,
    description,
    url,
    sameAs: REPO_URL,
    version,
    dateModified: date,
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    inLanguage: 'en',
    creator: { '@type': 'Person', name: AUTHOR, url: AUTHOR_URL },
    keywords: ['UFO', 'UAP', 'unidentified anomalous phenomena', 'unidentified flying objects', 'Project Blue Book', 'GEIPAN', 'AARO', 'aviation', 'radar', 'history'],
    temporalCoverage: `${Math.min(...years)}/${Math.max(...years)}`,
    spatialCoverage: { '@type': 'Place', name: 'Worldwide', geo: { '@type': 'GeoShape', box: '-90 -180 90 180' } },
    variableMeasured: ['date', 'place', 'latitude', 'longitude', 'category', 'status', 'explanation', 'evidence', 'shape', 'witnesses', 'duration', 'flight path'],
    distribution: files.map((f) => ({ '@type': 'DataDownload', encodingFormat: f.format, contentUrl: `${url}${f.name}`, name: f.name })),
  };
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open data: ${records.length} UFO/UAP case files · God's Eye // UAP</title>
<meta name="description" content="${esc(description.slice(0, 300))}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#05070c">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="../logo.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="God's Eye // UAP">
<meta property="og:title" content="Open data: ${records.length} UFO/UAP case files">
<meta property="og:description" content="${esc(description.slice(0, 300))}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site)}og.jpg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ldJson(structured)}</script>
<style>
:root{color-scheme:dark}
body{margin:0;background:#05070c;color:#e8eaed;font:16px/1.6 Inter,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 20px 56px}
a{color:#00d4ff}
.brand{font:600 13px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-decoration:none}
h1{font-size:30px;line-height:1.2;margin:18px 0 6px;text-wrap:balance}
h2{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:#9aa4b2;margin:30px 0 8px}
.files{list-style:none;padding:0}
.files li{padding:10px 0;border-bottom:1px solid #141a24}
.files a{font:600 15px "JetBrains Mono",ui-monospace,monospace}
.table{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
td{padding:7px 10px 7px 0;border-bottom:1px solid #141a24;vertical-align:top}
td:first-child{font:13px "JetBrains Mono",ui-monospace,monospace;color:#9aa4b2;white-space:nowrap}
code,pre{font:13px "JetBrains Mono",ui-monospace,monospace}
pre{background:#0b1018;border:1px solid #141a24;border-radius:8px;padding:12px;overflow-x:auto}
footer{margin-top:40px;font-size:12px;color:#8a93a1}
footer a{color:inherit}
</style>
</head>
<body>
<main>
<a class="brand" href="../">GOD'S EYE // UAP</a>
<h1>Open data: ${records.length} UFO/UAP case files</h1>
<p>${esc(description)}</p>
<p>Version ${esc(version)}, built ${esc(date)}. Free to use under the MIT licence, like the rest of the <a href="${esc(REPO_URL)}">repository</a>; the media and archives the sources link to keep their own licences. Please credit “God's Eye // UAP” and link back.</p>
<h2>Files</h2>
<ul class="files">
${files.map((f) => `<li><a href="${f.name}" download>${f.name}</a> <span>· ${esc(f.what)}</span></li>`).join('\n')}
</ul>
<h2>Fields</h2>
<div class="table"><table>
${fields.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('\n')}
</table></div>
<h2>Example</h2>
<pre>fetch('${esc(url)}cases.json')
  .then((r) => r.json())
  .then(({ records }) => records.filter((c) => c.status === 'unresolved'));</pre>
<h2>Accuracy</h2>
<p>Positions follow the sources and are only as exact as <code>locationPrecision</code> says. Flight paths are reconstructions; each says what it is based on, and “approximate” ones are drawn from descriptions. A status says what the evidence supports, not what anyone believes. Corrections are welcome as <a href="${esc(REPO_URL)}/issues">issues on GitHub</a>.</p>
<footer>God's Eye // UAP · <a href="../case/">All case files</a> · <a href="../">The 3D globe</a> · made by <a href="${AUTHOR_URL}">${AUTHOR}</a></footer>
</main>
</body>
</html>
`;
  return { json, csv, geojson, page, records };
}
