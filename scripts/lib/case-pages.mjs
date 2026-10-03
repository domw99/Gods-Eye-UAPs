/**
 * A small static page per case, at case/<id>/, so a shared case link shows
 * that case's own preview (title, summary, share card image) on X, Reddit,
 * Discord and the rest, and so search engines can index every case.
 *
 * A link shared from the app ends in #globe, and the page sends those
 * visitors straight on to the case on the globe. Without it (a search
 * result, the case index) the page stays put and is read as a page: an
 * unconditional redirect made search engines treat all of them as
 * redirects to the app's front page, so none of them was indexed.
 */
import { STATUS, CATEGORY } from '../../src/data/taxonomy.js';
import { AUTHOR, AUTHOR_URL, REPO_URL } from '../../src/config.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** JSON for a <script type="application/ld+json"> block: `<` escaped so no text can close the script. */
export const ldJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

/** The fragment that marks a link shared from the app: the page then opens the case on the globe at once. */
export const GLOBE_HASH = '#globe';

/** The case's local calendar date, as written in its record ("14 April 1561"). */
export function caseDate(iso) {
  const m = /^(-?\d{1,4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${Number(m[1])}` : '';
}

/** Cut text at a word boundary to at most `max` characters. */
export function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1).replace(/\s+\S*$/, '');
  return `${cut.replace(/[\s,.;:—-]+$/, '')}…`;
}

/** The page for one case. `site` is the app's absolute URL, ending in '/'. */
export function casePage(c, { site, card = false, similar = [] }) {
  const url = `${site}case/${c.id}/`;
  const app = `../../#/case/${encodeURIComponent(c.id)}`;
  const year = (c.date || '').slice(0, 4).replace(/^0+/, '');
  const title = `${c.title} (${year})`;
  const description = clip(c.summary, 200);
  const image = card ? `${site}cards/${c.id}.jpg` : `${site}og.jpg`;
  const status = STATUS[c.status] || { label: String(c.status || '').toUpperCase(), long: '', color: '#00d4ff' };
  const facts = [['Shape', c.shape], ['Witnesses', c.witnesses], ['Duration', c.duration]].filter(([, v]) => v);
  const sources = (c.sources || []).filter((s) => /^https?:\/\//.test(s.url || ''));
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: title,
        description,
        image,
        url,
        mainEntityOfPage: url,
        inLanguage: 'en',
        author: { '@type': 'Person', name: AUTHOR, url: AUTHOR_URL },
        isPartOf: { '@type': 'WebSite', name: "God's Eye // UAP", url: site },
        about: { '@type': 'Thing', name: 'Unidentified anomalous phenomena', sameAs: 'https://en.wikipedia.org/wiki/Unidentified_flying_object' },
        temporalCoverage: c.date,
        contentLocation: {
          '@type': 'Place',
          name: c.place,
          ...(c.lat != null && c.lon != null ? { geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lon } } : {}),
        },
        ...(sources.length ? { citation: sources.map((s) => s.url) } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: "God's Eye // UAP", item: site },
          { '@type': 'ListItem', position: 2, name: 'Case files', item: `${site}case/` },
          { '@type': 'ListItem', position: 3, name: c.title, item: url },
        ],
      },
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · God's Eye // UAP</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#05070c">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="../../logo.svg">
<meta property="og:type" content="article">
<meta property="og:site_name" content="God's Eye // UAP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`${c.title}: the case on the God's Eye // UAP globe`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${ldJson(structured)}</script>
<script>if(location.hash===${JSON.stringify(GLOBE_HASH)})location.replace(${JSON.stringify(app)});</script>
<style>
:root{color-scheme:dark}
body{margin:0;background:#05070c;color:#e8eaed;font:16px/1.6 Inter,system-ui,sans-serif}
main{max-width:680px;margin:0 auto;padding:40px 20px 56px}
a{color:#00d4ff}
.brand{font:600 13px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-decoration:none}
h1{font-size:30px;line-height:1.2;margin:18px 0 6px;text-wrap:balance}
.meta{font:14px "JetBrains Mono",ui-monospace,monospace;color:#9aa4b2}
.status{display:inline-block;margin:14px 0 4px;padding:3px 10px;border:1px solid;border-radius:6px;font:600 12px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.08em}
h2{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:#9aa4b2;margin:28px 0 6px}
.open{display:inline-block;margin-top:18px;padding:10px 18px;border:1px solid #00d4ff;border-radius:8px;text-decoration:none;font-weight:600}
.crumbs{font:13px "JetBrains Mono",ui-monospace,monospace;color:#8a93a1}
.crumbs a:not(.brand){color:#9aa4b2}
ul{padding-left:20px}
img{max-width:100%;height:auto;border-radius:8px;margin-top:22px}
footer{margin-top:40px;font-size:12px;color:#8a93a1}
footer a{color:inherit}
</style>
</head>
<body>
<main>
<nav class="crumbs"><a class="brand" href="../../">GOD'S EYE // UAP</a> › <a href="../">Case files</a></nav>
<h1>${esc(c.title)}</h1>
<div class="meta">${esc(caseDate(c.date))} · ${esc(c.place)}${c.category && CATEGORY[c.category] ? ` · ${esc(CATEGORY[c.category])}` : ''}</div>
<div class="status" style="color:${status.color}">${esc(status.label)}</div>${status.long ? ` <span class="meta">${esc(status.long)}</span>` : ''}
<div><a class="open" href="${esc(app)}">Open on the 3D globe →</a></div>
${card ? `<img src="../../cards/${esc(c.id)}.jpg" width="1200" height="630" alt="">` : ''}
<p>${esc(c.summary)}</p>
${c.explanation ? `<h2>Explanation</h2>\n<p>${esc(c.explanation)}</p>` : ''}
${facts.length ? `<h2>What was seen</h2>\n<p>${facts.map(([k, v]) => `${k}: ${esc(v)}`).join('<br>\n')}</p>` : ''}
${sources.length ? `<h2>Sources</h2>\n<ul>\n${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label || s.url)}</a></li>`).join('\n')}\n</ul>` : ''}
${similar.length ? `<h2>Similar cases</h2>\n<ul>\n${similar.map((d) => `<li><a href="../${esc(d.id)}/">${esc(d.title)}</a> <span class="meta">${esc(caseDate(d.date))}</span></li>`).join('\n')}\n</ul>` : ''}
<a class="open" href="${esc(app)}">Open on the 3D globe →</a>
<footer>God's Eye // UAP · <a href="../">All case files</a> · <a href="../../open-data/">Open data</a> · made by <a href="${AUTHOR_URL}">${AUTHOR}</a></footer>
</main>
</body>
</html>
`;
}

/** The front page's structured data: the site, the app and the open data, with the current counts. */
export function siteStructuredData(cases, { site }) {
  const years = cases.map((c) => Number(c.date.slice(0, 4)));
  const span = `${Math.min(...years)} to ${Math.max(...years)}`;
  const author = { '@type': 'Person', name: AUTHOR, url: AUTHOR_URL };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${site}#website`,
        name: "God's Eye // UAP",
        url: site,
        inLanguage: 'en',
        description: 'Every well-documented UFO/UAP encounter on a 3D globe, with replayable flight paths, the official files and footage, and the tools to check each sighting yourself.',
        author,
      },
      {
        '@type': 'WebApplication',
        name: "God's Eye // UAP",
        url: site,
        applicationCategory: 'ReferenceApplication',
        operatingSystem: 'Any (a web browser with WebGL)',
        browserRequirements: 'Requires WebGL',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        image: `${site}og.jpg`,
        inLanguage: ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'id', 'ja', 'ko', 'zh'],
        featureList: [
          `${cases.length} documented UFO/UAP case files from ${span} on a 3D globe`,
          'Reconstructed flight paths you can replay',
          'Project Blue Book, GEIPAN and MUFON files as map layers',
          'Full-text search of 22,000 journal pages',
          'The sky, weather, military airspace and rocket launches at the time of a sighting',
          'An interactive map of the Moon with its landing sites and lunar reports',
        ],
        author,
        sameAs: REPO_URL,
      },
      {
        '@type': 'Dataset',
        name: "God's Eye // UAP case files",
        url: `${site}open-data/`,
        license: 'https://opensource.org/licenses/MIT',
        description: `${cases.length} well-documented UFO/UAP encounters from ${span} as JSON, CSV and GeoJSON, with explanations, evidence, sources and reconstructed flight paths.`,
        creator: author,
      },
    ],
  };
}

/** The decade a case falls in, as a heading for the index ("1950s"); everything before 1900 is one group. */
export function decadeOf(iso) {
  const year = Number((iso || '').slice(0, 4));
  return year < 1900 ? 'Before 1900' : `${Math.floor(year / 10) * 10}s`;
}

/** case/: every case as a plain list, oldest first, for readers without a 3D globe and for search engines. */
export function caseIndex(cases, { site }) {
  const url = `${site}case/`;
  const sorted = [...cases].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const c of sorted) {
    const k = decadeOf(c.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const countries = new Set(cases.map((c) => c.cc).filter(Boolean)).size;
  const first = sorted[0]?.date.slice(0, 4);
  const last = sorted.at(-1)?.date.slice(0, 4);
  const description = `${cases.length} well-documented UFO/UAP encounters from ${first} to ${last}, in ${countries} countries: each with its sources, its timeline and the official or best explanation.`;
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: "Case files · God's Eye // UAP",
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: "God's Eye // UAP", url: site },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: sorted.length,
      itemListElement: sorted.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${url}${c.id}/`, name: c.title })),
    },
  };
  const row = (c) => {
    const status = STATUS[c.status] || { label: String(c.status || '').toUpperCase(), color: '#00d4ff' };
    return `<li><a href="${esc(c.id)}/">${esc(c.title)}</a> <span class="meta">${esc(caseDate(c.date))} · ${esc(c.place)}</span> <span class="status" style="color:${status.color}">${esc(status.label)}</span></li>`;
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>All ${cases.length} case files · God's Eye // UAP</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#05070c">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="../logo.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="God's Eye // UAP">
<meta property="og:title" content="All ${cases.length} case files · God's Eye // UAP">
<meta property="og:description" content="${esc(description)}">
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
ul{list-style:none;padding:0;margin:0}
li{padding:7px 0;border-bottom:1px solid #141a24}
.meta{font:13px "JetBrains Mono",ui-monospace,monospace;color:#9aa4b2}
.status{font:600 11px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.08em;white-space:nowrap}
.open{display:inline-block;margin:18px 12px 0 0;padding:10px 18px;border:1px solid #00d4ff;border-radius:8px;text-decoration:none;font-weight:600}
footer{margin-top:40px;font-size:12px;color:#8a93a1}
footer a{color:inherit}
</style>
</head>
<body>
<main>
<a class="brand" href="../">GOD'S EYE // UAP</a>
<h1>All ${cases.length} case files</h1>
<p>${esc(description)} Each link opens the case file; from there it opens on the 3D globe with its flight path, the footage and the files.</p>
<a class="open" href="../">Open the 3D globe →</a><a class="open" href="../open-data/">Download the data</a>
${[...groups].map(([k, list]) => `<h2>${esc(k)} · ${list.length}</h2>\n<ul>\n${list.map(row).join('\n')}\n</ul>`).join('\n')}
<footer>God's Eye // UAP · <a href="../open-data/">Open data</a> · <a href="${esc(REPO_URL)}">Source code</a> · made by <a href="${AUTHOR_URL}">${AUTHOR}</a></footer>
</main>
</body>
</html>
`;
}

/** sitemap.xml for the app, the case index, the open data and every case page. */
export function sitemap(site, ids, lastmod) {
  const urls = [site, `${site}case/`, `${site}open-data/`, ...ids.map((id) => `${site}case/${id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
}
