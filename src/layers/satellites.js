import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import * as Astro from 'astronomy-engine';

/**
 * Live "sky check" layer: propagates CelesTrak element sets with satellite.js
 * so observers can see what is overhead right now — Starlink trains, the ISS
 * and bright satellites are a leading source of modern UAP reports.
 */
const GROUPS = [
  { id: 'stations', color: '#ffffff', size: 7, label: 'Space stations' },
  { id: 'visual', color: '#ffd166', size: 5, label: 'Brightest satellites' },
  { id: 'starlink', color: '#7dd3ff', size: 2.5, label: 'Starlink' },
];

function parseTle(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const [name, l1, l2] = lines.slice(i, i + 3);
    if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue;
    try {
      out.push({ name: name.trim(), satrec: satellite.twoline2satrec(l1, l2), norad: l2.slice(2, 7).trim() });
    } catch {}
  }
  return out;
}

export function createSatelliteLayer(viewer, onStatus = () => {}) {
  const collection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  collection.show = false;
  const sats = [];
  let loaded = false;
  let loading = null;
  let timer = null;
  const scratch = new Cesium.Cartesian3();

  function load() {
    loading ||= doLoad();
    return loading;
  }
  async function doLoad() {
    if (loaded) return;
    loaded = true;
    const seen = new Set();
    for (const g of GROUPS) {
      try {
        onStatus(`Loading ${g.label}…`);
        const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g.id}&FORMAT=tle`);
        if (!res.ok) throw new Error(res.status);
        for (const s of parseTle(await res.text())) {
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
    onStatus(`${sats.length.toLocaleString()} satellites (CelesTrak, live)`);
    tick();
  }

  function position(sat, date) {
    const pv = satellite.propagate(sat.satrec, date);
    if (!pv?.position || typeof pv.position === "boolean") return null;
    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    return {
      lat: satellite.degreesLat(geo.latitude),
      lon: satellite.degreesLong(geo.longitude),
      altKm: geo.height,
      speed: pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null,
    };
  }

  function tick() {
    const now = new Date();
    for (const sat of sats) {
      const p = position(sat, now);
      if (!p) {
        sat.point.show = false;
        continue;
      }
      sat.point.show = true;
      sat.point.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000, undefined, scratch);
      sat.last = p;
    }
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
      const now = new Date();
      const gmst = satellite.gstime(now);
      const observer = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0.1 };
      const out = [];
      for (const s of sats) {
        const pv = satellite.propagate(s.satrec, now);
        if (!pv?.position || typeof pv.position === "boolean") continue;
        const look = satellite.ecfToLookAngles(observer, satellite.eciToEcf(pv.position, gmst));
        const el = satellite.radiansToDegrees(look.elevation);
        if (el >= minElevationDeg)
          out.push({ name: s.name, group: s.group, elevation: el, azimuth: satellite.radiansToDegrees(look.azimuth), rangeKm: look.rangeSat });
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
      const gmst = satellite.gstime(date);
      const observer = { latitude: satellite.degreesToRadians(lat), longitude: satellite.degreesToRadians(lon), height: 0.1 };
      const sun = Astro.GeoVector(Astro.Body.Sun, Astro.MakeTime(date), true);
      const sLen = Math.hypot(sun.x, sun.y, sun.z);
      const s = { x: sun.x / sLen, y: sun.y / sLen, z: sun.z / sLen };
      const out = [];
      for (const sat of sats) {
        const pv = satellite.propagate(sat.satrec, date);
        if (!pv?.position || typeof pv.position === 'boolean') continue;
        const look = satellite.ecfToLookAngles(observer, satellite.eciToEcf(pv.position, gmst));
        const el = satellite.radiansToDegrees(look.elevation);
        if (el < minElevationDeg) continue;
        out.push({
          name: sat.name,
          group: sat.group,
          elevation: el,
          azimuth: satellite.radiansToDegrees(look.azimuth),
          rangeKm: look.rangeSat,
          sunlit: isSunlit(pv.position, s),
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
