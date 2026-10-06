/**
 * Wikipedia / Wikimedia Commons helpers (CORS-enabled public APIs).
 * Results are cached for the session; requests identify the app via
 * Api-User-Agent as Wikimedia asks.
 */
import { fetchWithTimeout } from '../util/net.js';

const HEADERS = { 'Api-User-Agent': 'GodsEyeUAP/0.1 (https://github.com/domw99/Gods-Eye-UAPs)' };
const cache = new Map();

async function cachedJson(url) {
  if (cache.has(url)) return cache.get(url);
  const attempt = async (n) => {
    const r = await fetchWithTimeout(url, { headers: HEADERS });
    if (r.status === 429 && n < 3) {
      const wait = (Number(r.headers.get('Retry-After')) || 2 ** n) * 1000;
      await new Promise((res) => setTimeout(res, Math.min(wait, 8000)));
      return attempt(n + 1);
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  };
  const promise = attempt(0);
  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  return promise;
}

// Commons returns its credits as HTML: the tags go, and so do the entities (&amp; would otherwise be shown as written once the page escapes it).
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? match;
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
const stripTags = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export async function wikiSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const d = await cachedJson(url);
  return {
    title: d.title,
    extract: d.extract,
    thumbnail: d.thumbnail?.source || null,
    url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

function imageInfo(page) {
  const ii = page.imageinfo?.[0];
  if (!ii) return null;
  const em = ii.extmetadata || {};
  return {
    title: page.title,
    url: ii.url,
    thumb: ii.thumburl || ii.url,
    mime: ii.mime,
    width: ii.width,
    height: ii.height,
    page: ii.descriptionurl,
    license: stripTags(em.LicenseShortName?.value),
    artist: stripTags(em.Artist?.value).slice(0, 120),
    description: stripTags(em.ImageDescription?.value).slice(0, 400),
    date: stripTags(em.DateTimeOriginal?.value),
  };
}

/** Metadata + thumbnails for a list of Commons file titles. */
export async function commonsFiles(titles, width = 640) {
  if (!titles.length) return new Map();
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: String(width),
  });
  const d = await cachedJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const norm = new Map((d.query?.normalized || []).map((n) => [n.to, n.from]));
  const out = new Map();
  for (const page of d.query?.pages || []) {
    const info = imageInfo(page);
    if (info) out.set(norm.get(page.title) || page.title, info);
  }
  return out;
}

/** Link to view a Commons file page. */
export const commonsPage = (title) => `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
