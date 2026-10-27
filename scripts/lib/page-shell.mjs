/**
 * The frame the generated static pages share (the browse pages and the
 * lists): a head with the link-preview and search tags, the dark page style,
 * and a footer. Each page is a plain HTML document with no script.
 */
import { AUTHOR, AUTHOR_URL, REPO_URL } from '../../src/config.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** JSON for a <script type="application/ld+json"> block: `<` escaped so no text can close the script. */
export const ldJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The case's local calendar date, as written in its record ("14 April 1561"). */
export function caseDate(iso) {
  const m = /^(-?\d{1,4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${Number(m[1])}` : '';
}

export const PAGE_CSS = `:root{color-scheme:dark}
body{margin:0;background:#05070c;color:#e8eaed;font:16px/1.6 Inter,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 20px 56px}
a{color:#00d4ff}
.brand{font:600 13px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-decoration:none}
.crumbs{font:13px "JetBrains Mono",ui-monospace,monospace;color:#8a93a1}
.crumbs a:not(.brand){color:#9aa4b2}
h1{font-size:30px;line-height:1.2;margin:18px 0 6px;text-wrap:balance}
h2{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:#9aa4b2;margin:30px 0 8px}
ul{list-style:none;padding:0;margin:0}
li{padding:7px 0;border-bottom:1px solid #141a24}
.meta{font:13px "JetBrains Mono",ui-monospace,monospace;color:#9aa4b2}
.status{font:600 11px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.08em;white-space:nowrap}
.open{display:inline-block;margin:18px 12px 0 0;padding:10px 18px;border:1px solid #00d4ff;border-radius:8px;text-decoration:none;font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}
.chips li{padding:0;border:0}
.chips a{display:inline-block;padding:4px 10px;border:1px solid #1d2633;border-radius:999px;text-decoration:none;font-size:14px}
.chips small{color:#9aa4b2}
footer{margin-top:40px;font-size:12px;color:#8a93a1}
footer a{color:inherit}`;

/**
 * A page. `root` is the relative path back to the site root ('../../'), for the
 * logo and the footer links; `url` is the page's own absolute address.
 * `noindex` is for the not-found page: kept out of search, with no canonical
 * address (it answers for every missing one) and no structured data.
 */
export function pageShell({ site, root, url, title, description, ld, body, image, noindex = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${AUTHOR}">
<meta name="robots" content="${noindex ? 'noindex' : 'index,follow,max-image-preview:large'}">
<meta name="theme-color" content="#05070c">
${noindex ? '' : `<link rel="canonical" href="${esc(url)}">\n`}<link rel="icon" type="image/svg+xml" href="${root}logo.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="God's Eye // UAP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image || `${site}og.jpg`)}">
<meta name="twitter:card" content="summary_large_image">
${ld ? `<script type="application/ld+json">${ldJson(ld)}</script>\n` : ''}<style>
${PAGE_CSS}
</style>
</head>
<body>
<main>
${body}
<footer>God's Eye // UAP · <a href="${root}case/">All case files</a> · <a href="${root}browse/">Browse</a> · <a href="${root}open-data/">Open data</a> · <a href="${esc(REPO_URL)}">Source code</a> · made by <a href="${AUTHOR_URL}">${AUTHOR}</a></footer>
</main>
</body>
</html>
`;
}

/**
 * 404.html at the site root, which GitHub Pages serves for every missing address
 * (a mistyped or renamed case page, an old link). It can be shown at any depth,
 * so its links are absolute. No script: it only offers the ways back.
 */
export function notFoundPage({ site }) {
  const body = `<nav class="crumbs"><a class="brand" href="${esc(site)}">GOD'S EYE // UAP</a></nav>
<h1>Page not found</h1>
<p>There is no page at this address. If you followed a link to a case, its address may have changed: every case is in the list of case files, and the globe can search them all.</p>
<a class="open" href="${esc(site)}">Open the 3D globe →</a><a class="open" href="${esc(site)}case/">All case files</a><a class="open" href="${esc(site)}browse/">Browse</a>`;
  return pageShell({
    site,
    root: site,
    url: `${site}404.html`,
    title: "Page not found · God's Eye // UAP",
    description: 'There is no page at this address. Every case file is listed in the case index, and the 3D globe can search them all.',
    ld: null,
    body,
    noindex: true,
  });
}
