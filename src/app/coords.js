/**
 * Coordinates typed or pasted into the search box, read without the network:
 * decimal degrees ("51.5, -0.12"), degrees with a hemisphere ("51.5N 0.12W",
 * "N 51.5 W 0.12"), degrees-minutes-seconds (51°30'26"N 0°7'39"W) or degrees
 * and decimal minutes, military grid references ("13S ES 44360 95102"), and the
 * links map sites and phones share (geo: links, Google Maps, OpenStreetMap,
 * Apple Maps). Latitude comes first unless it cannot be one ("-122.4, 37.8" is
 * read as longitude, latitude).
 */
import { fromMgrs } from '../util/mgrs.js';

const NUM = String.raw`\d+(?:\.\d+)?`;
const TOKEN = new RegExp(`([NSEW])(?![a-z])|(-?${NUM})|([°'"])`, 'gi');

/** Plain-text clean-up: typographic marks to the plain ones, unit words to their marks. */
function normalise(text) {
  return String(text)
    .replace(/[−–—]/g, '-')
    .replace(/[′’ʼ‘]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/[º˚]/g, '°')
    .replace(/\bdegrees?\b|\bdeg\b/gi, '°')
    .replace(/\bminutes?\b|\bmin\b/gi, "'")
    .replace(/\bseconds?\b|\bsec\b/gi, '"')
    .replace(/\b(north|south|east|west)\b/gi, (w) => w[0]);
}

/** The latitude and longitude in a map link, or null. */
function fromLink(text) {
  let m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(text);
  if (m) return [m[1], m[2]];
  if (!/^https?:\/\//i.test(text)) return null;
  m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(text) // Google Maps place
    || /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(text) // Google Maps view
    || /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(text) // OpenStreetMap
    || /[?&](?:mlat|lat)=(-?\d+(?:\.\d+)?)&(?:mlon|lon|lng)=(-?\d+(?:\.\d+)?)/.exec(text)
    || /[?&](?:q|ll|query|sll|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i.exec(text); // Google, Apple
  return m ? [m[1], m[2]] : null;
}

/** One group of tokens (a number, or degrees minutes seconds, and a hemisphere) as a signed value and its axis. */
function group(tokens) {
  const nums = tokens.filter((t) => t.num != null);
  const hemi = tokens.find((t) => t.hemi)?.hemi ?? null;
  if (!nums.length || nums.length > 3) return null;
  const [d, m = 0, s = 0] = nums.map((t) => Math.abs(t.num));
  if (nums.length > 1 && (m >= 60 || s >= 60 || Number.isInteger(nums[0].num) === false)) return null; // minutes follow whole degrees only
  if (nums.length > 2 && !Number.isInteger(nums[1].num)) return null;
  let value = d + m / 60 + s / 3600;
  if (nums[0].num < 0 || Object.is(nums[0].num, -0)) value = -value;
  if (hemi === 'S' || hemi === 'W') value = -Math.abs(value);
  else if (hemi) value = Math.abs(value);
  return { value, axis: hemi ? ('NS'.includes(hemi) ? 'lat' : 'lon') : null };
}

/** { lat, lon } for text that is a coordinate pair, or null. */
export function parseCoordinates(input) {
  const raw = String(input ?? '').trim();
  const text = normalise(raw);
  if (!text || text.length > 200) return null;
  const grid = fromMgrs(raw);
  if (grid) return grid;
  const link = fromLink(text);
  let pair;
  if (link) pair = [{ value: Number(link[0]), axis: null }, { value: Number(link[1]), axis: null }];
  else {
    const tokens = [...text.matchAll(TOKEN)].map((m) => (m[1] ? { hemi: m[1].toUpperCase() } : m[2] != null ? { num: Number(m[2]) } : { mark: m[3] }));
    // Text that is not only coordinates (words, other punctuation) is a search, not a place.
    const leftover = text.replace(TOKEN, '').replace(/[\s,;/]+/g, '');
    if (leftover || !tokens.length) return null;
    const hemis = tokens.filter((t) => t.hemi);
    let groups;
    if (!hemis.length) {
      const nums = tokens.filter((t) => t.num != null);
      // Two bare numbers are a place only when written like one, so "1952 7" stays a search.
      if (nums.length !== 2 || !/[.,;°]/.test(text)) return null;
      groups = nums.map((t) => [t]);
    } else {
      if (hemis.length !== 2) return null;
      const prefix = tokens[0].hemi != null;
      groups = [];
      let current = [];
      for (const t of tokens) {
        if (t.mark) continue;
        if (prefix && t.hemi && current.length) {
          groups.push(current);
          current = [];
        }
        current.push(t);
        if (!prefix && t.hemi) {
          groups.push(current);
          current = [];
        }
      }
      if (current.length) groups.push(current);
      if (groups.length !== 2) return null;
    }
    pair = groups.map(group);
    if (pair.some((g) => !g)) return null;
  }
  let [a, b] = pair;
  if (a.axis && a.axis === b.axis) return null;
  if (a.axis === 'lon' || b.axis === 'lat') [a, b] = [b, a];
  else if (!a.axis && !b.axis && Math.abs(a.value) > 90 && Math.abs(b.value) <= 90) [a, b] = [b, a];
  const lat = a.value;
  const lon = b.value;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** "51.5000° N, 0.1200° W". */
export function formatCoordinates(lat, lon, digits = 4) {
  const part = (v, pos, neg) => `${Math.abs(v).toFixed(digits)}° ${v < 0 ? neg : pos}`;
  return `${part(lat, 'N', 'S')}, ${part(lon, 'E', 'W')}`;
}
