import * as Cesium from 'cesium';
import * as Astro from 'astronomy-engine';
import { t } from '../i18n/index.js';
import { fetchWithTimeout } from '../util/net.js';

/**
 * Live "sky check" layer: propagates CelesTrak element sets with satellite.js (in orbits.js)
 * so observers can see what is overhead right now — Starlink trains, the ISS
 * and bright satellites are a leading source of modern UAP reports.
 */
const GROUPS = [
  { id: 'stations', color: '#ffffff', size: 7, label: 'Space stations' },
  { id: 'visual', color: '#ffd166', size: 5, label: 'Brightest satellites' },
  { id: 'starlink', color: '#7dd3ff', size: 2.5, label: 'Starlink' },
];

// CelesTrak asks clients not to download the same data more than once every
// two hours and blocks those that do, so element sets are kept that long.
const TLE_TTL = 2 * 3600e3;
async function fetchTle(url) {
  let cache = null;
  try {
    cache = await caches.open('gods-eye-uap-tle');
  } catch {
    /* Cache Storage needs a secure context */
  }
  const hit = cache ? await cache.match(url) : null;
  if (hit && Date.now() - Number(hit.headers.get('x-fetched') || 0) < TLE_TTL) return hit.text();
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`CelesTrak ${res.status}`);
    const text = await res.text();
    try {
      await cache?.put(url, new Response(text, { headers: { 'content-type': 'text/plain', 'x-fetched': String(Date.now()) } }));
    } catch {
      /* storage full: fine, just not cached */
    }
    return text;
  } catch (error) {
    if (hit) return hit.text(); // an older copy beats nothing; positions drift slowly
    throw error;
  }
}

/** The orbit maths (layers/orbits.js), loaded with the first element sets. */
let orbitsModule = null;
function loadOrbits() {
  orbitsModule ||= import('./orbits.js').catch((error) => {
    orbitsModule = null; // offline: try again next time
    throw error;
  });
  return orbitsModule;
}

export function createSatelliteLayer(viewer, onStatus = () => {}) {
  const collection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  collection.show = false;
  const sats = [];
  let loaded = false;
  let loading = null;
  let timer = null;
  let orbits = null; // the orbit maths, once loaded
  const scratch = new Cesium.Cartesian3();

  function load() {
    loading ||= doLoad();
    return loading;
  }
  async function doLoad() {
    if (loaded) return;
    loaded = true;
    try {
      orbits = await loadOrbits();
    } catch (error) {
      console.warn('[satellites]', error);
      loaded = false;
      loading = null;
      onStatus('offline');
      return;
    }
    const seen = new Set();
    for (const g of GROUPS) {
      try {
        onStatus(t('Loading {name}…', { name: t(g.label) }));
        const text = await fetchTle(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g.id}&FORMAT=tle`);
        for (const s of orbits.parseTle(text)) {
          if (seen.has(s.norad)) continue;
          seen.add(s.norad);
          const point = collection.add({
            pixelSize: g.size,
            color: Cesium.Color.fromCssColorString(g.color).withAlpha(0.9),
            id: { layer: 'satellite', index: sats.length },
          });
          sats.push({ ...s, group: g.label, point });
        }
      } catch (error) {
        console.warn('[satellites]', g.id, error);
      }
    }
    if (!sats.length) {
      // Nothing loaded (offline or CelesTrak down): allow a retry next time.
      loaded = false;
      loading = null;
      onStatus('offline');
      return;
    }
    onStatus(`${sats.length.toLocaleString()} satellites (CelesTrak, live)`);
    tick();
  }

  function tick() {
    const now = new Date();
    for (const sat of sats) {
      const p = orbits.geodeticAt(sat.satrec, now);
      if (!p) {
        sat.point.show = false;
        continue;
      }
      sat.point.show = true;
      sat.point.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000, undefined, scratch);
      sat.last = p;
    }
    viewer.scene.requestRender();
  }

  return {
    set show(on) {
      collection.show = on;
      if (on) {
        load();
        clearInterval(timer);
        timer = setInterval(tick, 1000);
      } else clearInterval(timer);
    },
    info(index) {
      const s = sats[index];
      return s ? { name: s.name, norad: s.norad, group: s.group, ...s.last } : null;
    },
    /** Satellites above the horizon from an observer right now. */
    overhead(lat, lon, minElevationDeg = 10) {
      if (!sats.length) return [];
      const look = orbits.skyFrom(lat, lon, new Date());
      const out = [];
      for (const s of sats) {
        const l = look(s.satrec);
        if (l && l.elevation >= minElevationDeg) out.push({ name: s.name, group: s.group, elevation: l.elevation, azimuth: l.azimuth, rangeKm: l.rangeKm });
      }
      return out.sort((a, b) => b.elevation - a.elevation);
    },
    get count() {
      return sats.length;
    },
    /** Load the element sets without showing the layer (for the sighting checker). */
    ensureLoaded: () => load(),
    /**
     * Satellites above `minElevationDeg` from an observer at `date`, with
     * whether each was lit by the Sun. Current element sets are only good for
     * a few weeks either side of today.
     */
    visibleAt(lat, lon, date, minElevationDeg = 10) {
      if (!sats.length) return [];
      const look = orbits.skyFrom(lat, lon, date);
      const sun = Astro.GeoVector(Astro.Body.Sun, Astro.MakeTime(date), true);
      const sLen = Math.hypot(sun.x, sun.y, sun.z);
      const s = { x: sun.x / sLen, y: sun.y / sLen, z: sun.z / sLen };
      const out = [];
      for (const sat of sats) {
        const l = look(sat.satrec);
        if (!l || l.elevation < minElevationDeg) continue;
        out.push({
          name: sat.name,
          group: sat.group,
          elevation: l.elevation,
          azimuth: l.azimuth,
          rangeKm: l.rangeKm,
          sunlit: isSunlit(l.position, s),
        });
      }
      return out.sort((a, b) => b.elevation - a.elevation);
    },
  };
}

/** Cylindrical Earth-shadow test; position in km (ECI), sun a unit vector. */
export function isSunlit(r, s) {
  const along = r.x * s.x + r.y * s.y + r.z * s.z;
  if (along > 0) return true;
  const px = r.x - along * s.x;
  const py = r.y - along * s.y;
  const pz = r.z - along * s.z;
  return Math.hypot(px, py, pz) > 6371;
}
