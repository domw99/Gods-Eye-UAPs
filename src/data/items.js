import { CASES } from './cases/index.js';

/**
 * Normalise curated cases, official releases and the user's own log into one
 * "item" shape for the list, globe and timeline.
 */
const OFFICIAL_STATUS = { unresolved: 'unresolved', resolved: 'explained', unknown: 'unassessed' };

export function caseToItem(c) {
  const date = new Date(c.date);
  return {
    key: `case:${c.id}`,
    kind: 'case',
    id: c.id,
    title: c.title,
    date,
    year: date.getUTCFullYear(),
    lat: c.lat,
    lon: c.lon,
    precision: c.precision,
    radiusKm: null,
    status: c.status,
    evidence: c.evidence,
    place: c.place,
    country: c.country,
    category: c.category,
    hasTrack: (c.tracks || []).length > 0,
    search: [c.title, c.place, c.country, c.summary, c.shape, c.category, c.status, ...(c.evidence || [])]
      .join(' ')
      .toLowerCase(),
    ref: c,
  };
}

export function officialToItem(o) {
  const date = new Date(`${o.dateTaken || `${o.year || 2000}-01-01`}T12:00:00Z`);
  const evidence = ['official-document'];
  if (o.type === 'video') evidence.push('video');
  if (o.type === 'image') evidence.push('photo');
  if (/infrared|sensor/i.test(o.description)) evidence.push('sensor-data');
  if (/audio/i.test(o.title)) evidence.push('audio');
  if (/law enforcement|police|officer/i.test(o.description)) evidence.push('police-witness');
  return {
    key: `official:${o.dvidsId}`,
    kind: 'official',
    id: o.dvidsId,
    title: o.title,
    date,
    year: o.year || date.getUTCFullYear(),
    lat: o.location?.lat ?? null,
    lon: o.location?.lon ?? null,
    precision: o.location?.precision || null,
    radiusKm: o.location?.radiusKm || null,
    status: OFFICIAL_STATUS[o.status] || 'unassessed',
    evidence,
    place: o.location?.name || 'Location not released',
    country: o.countryCode || '',
    category: 'photo-video',
    hasTrack: false,
    search: [o.title, o.releaseId, o.agency, o.location?.name, o.description].join(' ').toLowerCase(),
    ref: o,
  };
}

export function userToItem(u) {
  const date = new Date(u.date);
  return {
    key: `user:${u.id}`,
    kind: 'user',
    id: u.id,
    title: u.title || 'My sighting',
    date,
    year: date.getUTCFullYear(),
    lat: u.lat,
    lon: u.lon,
    precision: 'site',
    radiusKm: null,
    status: 'unassessed',
    evidence: u.media ? ['photo'] : [],
    place: u.place || `${u.lat.toFixed(3)}, ${u.lon.toFixed(3)}`,
    country: '',
    category: 'close-encounter',
    hasTrack: false,
    search: [u.title, u.place, u.shape, u.description].join(' ').toLowerCase(),
    ref: u,
  };
}

export const CASE_ITEMS = CASES.map(caseToItem);

export async function loadOfficial(base) {
  const res = await fetch(`${base}data/official-uap-media.json`);
  if (!res.ok) throw new Error(`official catalogue ${res.status}`);
  const data = await res.json();
  return { meta: data, items: data.items.map(officialToItem) };
}
