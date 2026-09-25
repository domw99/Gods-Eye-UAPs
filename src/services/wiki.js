/**
 * Wikipedia / Wikimedia Commons helpers (CORS-enabled public APIs).
 * Results are cached for the session; requests identify the app via
 * Api-User-Agent as Wikimedia asks.
 */
const HEADERS = { 'Api-User-Agent': 'GodsEyeUAP/0.1 (https://github.com/domw99/Gods-Eye-UAPs)' };
const cache = new Map();

async function cachedJson(url) {
  if (cache.has(url)) return cache.get(url);
  const attempt = async (n) => {
    const r = await fetch(url, { headers: HEADERS });
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

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

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
    lat: page.coordinates?.[0]?.lat,
    lon: page.coordinates?.[0]?.lon,
    dist: page.index,
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

/** Geotagged Commons photos taken near a point, nearest first. */
export async function photosNear(lat, lon, radiusM = 10000, limit = 24) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'geosearch',
    ggscoord: `${lat}|${lon}`,
    ggsradius: String(Math.min(10000, Math.max(10, Math.round(radiusM)))),
    ggsnamespace: '6',
    ggslimit: String(limit),
    prop: 'imageinfo|coordinates',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '420',
  });
  const d = await cachedJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  return (d.query?.pages || [])
    .map(imageInfo)
    .filter((x) => x && /^image\/(jpeg|png|webp)/.test(x.mime))
    .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
}

/** Link to view a Commons file page. */
export const commonsPage = (title) => `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
