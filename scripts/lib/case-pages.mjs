/**
 * A small static page per case, at case/<id>/, so a shared case link shows
 * that case's own preview (title, summary, share card image) on X, Reddit,
 * Discord and the rest. Link-preview crawlers don't run scripts; people
 * are sent straight on to the case on the globe.
 */
import { STATUS, CATEGORY } from '../../src/data/taxonomy.js';
import { AUTHOR, AUTHOR_URL } from '../../src/config.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

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
export function casePage(c, { site, card = false }) {
  const url = `${site}case/${c.id}/`;
  const app = `../../#/case/${encodeURIComponent(c.id)}`;
  const year = (c.date || '').slice(0, 4).replace(/^0+/, '');
  const title = `${c.title} (${year})`;
  const description = clip(c.summary, 200);
  const image = card ? `${site}cards/${c.id}.jpg` : `${site}og.jpg`;
  const status = STATUS[c.status] || { label: String(c.status || '').toUpperCase(), long: '', color: '#00d4ff' };
  const facts = [['Shape', c.shape], ['Witnesses', c.witnesses], ['Duration', c.duration]].filter(([, v]) => v);
  const sources = (c.sources || []).filter((s) => /^https?:\/\//.test(s.url || ''));
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
<script>location.replace(${JSON.stringify(app)});</script>
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
.open{display:inline-block;margin-top:26px;padding:10px 18px;border:1px solid #00d4ff;border-radius:8px;text-decoration:none;font-weight:600}
img{max-width:100%;border-radius:8px;margin-top:22px}
footer{margin-top:40px;font-size:12px;color:#6b7482}
footer a{color:inherit}
</style>
</head>
<body>
<main>
<a class="brand" href="../../">GOD'S EYE // UAP</a>
<h1>${esc(c.title)}</h1>
<div class="meta">${esc(caseDate(c.date))} · ${esc(c.place)}${c.category && CATEGORY[c.category] ? ` · ${esc(CATEGORY[c.category])}` : ''}</div>
<div class="status" style="color:${status.color}">${esc(status.label)}</div>${status.long ? ` <span class="meta">${esc(status.long)}</span>` : ''}
${card ? `<img src="../../cards/${esc(c.id)}.jpg" width="1200" height="630" alt="">` : ''}
<p>${esc(c.summary)}</p>
${c.explanation ? `<h2>Explanation</h2>\n<p>${esc(c.explanation)}</p>` : ''}
${facts.length ? `<h2>What was seen</h2>\n<p>${facts.map(([k, v]) => `${k}: ${esc(v)}`).join('<br>\n')}</p>` : ''}
${sources.length ? `<h2>Sources</h2>\n<ul>\n${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.label || s.url)}</a></li>`).join('\n')}\n</ul>` : ''}
<a class="open" href="${esc(app)}">Open on the 3D globe →</a>
<footer>God's Eye // UAP · made by <a href="${AUTHOR_URL}">${AUTHOR}</a></footer>
</main>
</body>
</html>
`;
}

/** sitemap.xml for the app and every case page. */
export function sitemap(site, ids, lastmod) {
  const urls = [site, ...ids.map((id) => `${site}case/${id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
}
