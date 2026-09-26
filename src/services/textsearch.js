/**
 * Full-text search over every journal page (the MUFON UFO Journal and the
 * research archives). scripts/build-textindex.mjs writes a word → pages
 * index split by first letter under public/data/textindex/; a search loads
 * only the letters it needs. The tokenizer here is shared with the build.
 */
export const STOP = new Set(
  `about above after again against also although among another anyone anything around because been before being below between both came cannot could does doing down during each either else enough even ever every from further have having here hers herself himself however into itself just know known like made make many might more most much must myself near never only other others ours over same seen shall should since some such than that their theirs them themselves then there these they this those though through thus under until upon very were what when where whether which while whom whose will with within without would your yours yourself said says told page issue journal mufon ufos saucer saucers object objects sighting sightings reported report reports witness witnesses light lights time times year years night people`.split(/\s+/),
);

/** Index words: lower case, accents kept, 4–24 letters, at least one vowel, no runs of three of one letter. */
export function words(text) {
  const out = new Set();
  for (const m of String(text).toLowerCase().matchAll(/\p{L}[\p{L}'’]*\p{L}/gu)) {
    const w = m[0].replace(/['’]s$/, '').replace(/['’]/g, '');
    if (w.length < 4 || w.length > 24 || STOP.has(w)) continue;
    if (!/[aeiouyàâäéèêëîïôöùûü]/.test(w) || /(.)\1\1/.test(w)) continue;
    out.add(w);
  }
  return out;
}

/** The shard a word lives in: its first letter, accents removed, or "_". */
export const shardOf = (w) => {
  const c = w.normalize('NFD')[0];
  return /[a-z]/.test(c) ? c : '_';
};

/** Sorted page ids → base-36 deltas, e.g. [3, 10, 11] → "3,7,1". */
export const encodePostings = (ids) => ids.map((id, i) => (id - (i ? ids[i - 1] : 0)).toString(36)).join(',');
export function decodePostings(s) {
  let acc = 0;
  return s.split(',').map((d) => (acc += parseInt(d, 36)));
}

/** Pages on every list (lists sorted ascending). */
export function intersect(lists) {
  if (!lists.length) return [];
  const sorted = [...lists].sort((a, b) => a.length - b.length);
  let out = sorted[0];
  for (const list of sorted.slice(1)) {
    const set = new Set(list);
    out = out.filter((x) => set.has(x));
  }
  return out;
}

/** Page id → { archive, issue, leaf } from the page counts in meta. */
export function pageLocator(meta) {
  const starts = []; // [firstId, archive, issue]
  let id = 0;
  for (const a of meta.archives)
    a.issuePages.forEach((n, issue) => {
      starts.push([id, a.key, issue]);
      id += n;
    });
  return (pid) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid][0] <= pid) lo = mid;
      else hi = mid - 1;
    }
    const [first, archive, issue] = starts[lo];
    return { archive, issue, leaf: pid - first };
  };
}

let metaPromise = null;
const shards = new Map();
const getJson = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return r.json();
  });

/**
 * Pages that contain every searchable word of the query. Words on too many
 * pages to index come back in `common` and do not narrow the search; words
 * the index lacks (on fewer than three pages) come back in `missing`.
 */
export async function searchJournals(base, query) {
  metaPromise ||= getJson(`${base}data/textindex/meta.json`).catch((e) => {
    metaPromise = null;
    throw e;
  });
  const meta = await metaPromise;
  const terms = [...words(query)];
  const found = [];
  const common = []; // on too many pages to index: they do not narrow the search
  const missing = []; // on fewer than three pages, or nowhere
  for (const t of terms) {
    const k = shardOf(t);
    if (!meta.shards.includes(k)) {
      missing.push(t);
      continue;
    }
    if (!shards.has(k)) {
      const p = getJson(`${base}data/textindex/${k}.json`);
      p.catch(() => shards.delete(k));
      shards.set(k, p);
    }
    const shard = await shards.get(k);
    if (shard[t]) found.push({ term: t, pages: decodePostings(shard[t]) });
    else if (meta.common?.includes(t)) common.push(t);
    else missing.push(t);
  }
  const locate = pageLocator(meta);
  // A word the index has never seen means no page has them all.
  const hits = found.length && !missing.length ? intersect(found.map((f) => f.pages)).map(locate) : [];
  return { terms: found.map((f) => f.term), common, missing, hits, totalPages: meta.pages, maxPages: meta.maxPages };
}
