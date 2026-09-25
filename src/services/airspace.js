/**
 * U.S. special-use airspace (FAA), bundled by scripts/build-airspace.mjs.
 * Used for the map layer and to say which military areas a case sits in.
 */
export const AIRSPACE_TYPES = {
  R: { label: 'Restricted area', color: '#ff4d4d' },
  W: { label: 'Warning area', color: '#ff9f1c' },
  MOA: { label: 'Military operations area', color: '#b388ff' },
  A: { label: 'Alert area', color: '#ffd166' },
  P: { label: 'Prohibited area', color: '#ff2d95' },
  D: { label: 'Danger area', color: '#ff6b6b' },
};

export function toArea([name, type, lowerFt, upperFt, city, state, timesOfUse, controller, polygons], index) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const poly of polygons)
    for (let i = 0; i < poly[0].length; i += 2) {
      west = Math.min(west, poly[0][i]);
      east = Math.max(east, poly[0][i]);
      south = Math.min(south, poly[0][i + 1]);
      north = Math.max(north, poly[0][i + 1]);
    }
  return { index, name, type, lowerFt, upperFt, city, state, timesOfUse, controller, polygons, bbox: [west, south, east, north] };
}

/** Even-odd ray cast on a flat [lon, lat, …] ring. */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function areaContains(area, lon, lat) {
  const [w, s, e, n] = area.bbox;
  if (lon < w || lon > e || lat < s || lat > n) return false;
  return area.polygons.some((rings) => pointInRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => pointInRing(lon, lat, hole)));
}

/** Areas containing a point; with altFt, only those whose vertical limits include it. */
export function areasAt(areas, lon, lat, altFt = null) {
  return areas.filter(
    (a) => areaContains(a, lon, lat) && (altFt == null || (altFt >= a.lowerFt - 500 && altFt <= a.upperFt + 500)),
  );
}

let cache = null;
export function loadAirspace(base = '/') {
  cache ||= fetch(`${base}data/airspace.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`airspace HTTP ${r.status}`);
      return r.json();
    })
    .then((d) => ({ generated: d.generated, source: d.source, areas: d.features.map(toArea) }))
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

export const formatFt = (ft) => (ft >= 99999 ? 'unlimited' : ft === 0 ? 'surface' : ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${ft.toLocaleString()} ft`);

/** Is this point anywhere near the dataset (U.S. and territories)? Cheap pre-check. */
export const nearUS = (lat, lon) => (lon > -180 && lon < -60 && lat > 12 && lat < 72) || (lon > 140 && lon < 180 && lat > 10 && lat < 30);
