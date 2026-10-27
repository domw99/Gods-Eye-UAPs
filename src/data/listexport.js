import { SITE_URL } from '../config.js';
import { toCsvRows } from '../util/csv.js';

/**
 * The records in the list, as the filters leave it, as a file to take away: CSV for a spreadsheet, GeoJSON for
 * a map. The full case files are the open data (open-data/); this is for "the 14 radar cases from the 1950s".
 * Dates are written as recorded, never the 1 January the list sorts an undated release by, and a release placed
 * only by region keeps its precision and radius, so nothing reads more exact than it is.
 */
export const LIST_COLUMNS = [
  'kind', 'id', 'title', 'date', 'timeApproximate', 'place', 'country', 'latitude', 'longitude', 'locationPrecision', 'radiusKm',
  'status', 'evidence', 'explanation', 'link',
];

/** One list item (src/data/items.js) as a flat record. */
export function listRecord(it, site = SITE_URL) {
  const r = it.ref || {};
  const base = {
    kind: it.kind,
    id: String(it.id),
    title: it.title,
    place: it.place ?? null,
    country: it.country || null,
    latitude: it.lat ?? null,
    longitude: it.lon ?? null,
    locationPrecision: it.precision ?? null,
    radiusKm: it.radiusKm ?? null,
    status: it.status,
    evidence: [...(it.evidence || [])],
    timeApproximate: null,
    explanation: null,
    link: null,
  };
  if (it.kind === 'case')
    return { ...base, date: r.date ?? null, timeApproximate: r.timeApprox === true, explanation: r.explanation ?? null, link: `${site}case/${encodeURIComponent(it.id)}/` };
  if (it.kind === 'official')
    return { ...base, date: r.dateTaken || (r.year ? String(r.year) : null), link: `${site}#/official/${encodeURIComponent(it.id)}` };
  return { ...base, date: r.date ?? null }; // your own log: it lives in this browser, so there is no link to it
}

/** The records as CSV, one row each; the evidence joined with " | " as in the open data. */
export function listCsv(records) {
  return toCsvRows(LIST_COLUMNS, records.map((r) => ({ ...r, evidence: r.evidence.join(' | ') })));
}

/**
 * The records as a GeoJSON FeatureCollection: a point for each placed record. `metadata` says when, with which
 * filters, and how many records had no position to draw (they are in the CSV).
 */
export function listGeoJson(records, { filters = {}, exported = new Date().toISOString(), site = SITE_URL } = {}) {
  const placed = records.filter((r) => r.latitude != null && r.longitude != null);
  return {
    type: 'FeatureCollection',
    features: placed.map((r) => ({
      type: 'Feature',
      id: `${r.kind}:${r.id}`,
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: { ...r, evidence: r.evidence.join(', ') },
    })),
    metadata: {
      name: "God's Eye // UAP: records from the list",
      source: site,
      exported,
      filters,
      records: records.length,
      withoutPosition: records.length - placed.length,
    },
  };
}

/** The filters in force, for the file's metadata and for anyone repeating the selection. Empty ones are left out. */
export function describeFilters(s) {
  const out = {};
  if (s.search) out.search = s.search;
  if (s.yearRange) out.years = [...s.yearRange];
  if (s.evidence?.size) out.evidence = [...s.evidence];
  if (s.shape?.size) out.shape = [...s.shape];
  if (s.status?.size) out.status = [...s.status];
  if (s.starredOnly) out.starredOnly = true;
  out.layers = Object.entries(s.layers || {})
    .filter(([k, on]) => on && ['cases', 'official', 'user'].includes(k))
    .map(([k]) => k);
  return out;
}

/** "gods-eye-uap-list-2026-10-27.csv" */
export const exportName = (ext, date = new Date()) => `gods-eye-uap-list-${date.toISOString().slice(0, 10)}.${ext}`;
