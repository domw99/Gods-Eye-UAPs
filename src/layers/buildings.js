import * as Cesium from 'cesium';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/**
 * Keyless 3D buildings: OpenStreetMap footprints and heights from the
 * OpenFreeMap vector tiles (OpenMapTiles schema, `building` layer), extruded
 * on the terrain. No account or API key.
 *
 * Tiles are loaded at z14 around the centre of the view once the camera is
 * low enough, one Primitive per tile, and dropped again as you move away.
 */
const TILEJSON = 'https://tiles.openfreemap.org/planet';
const FALLBACK_TILES = 'https://tiles.openfreemap.org/planet/20260913_164504_pt/{z}/{x}/{y}.pbf';
const Z = 14;
const LOAD_BELOW_M = 9000; // camera height at which tiles start loading
const SHOW_BELOW_M = 40000; // keep already-built tiles visible up to here
const MAX_TILES = 49;
const GRID = 8; // terrain samples per tile side (GRID+1)²

const CREDIT_HTML =
  'Buildings © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>';

const BASE_COLOR = Cesium.Color.fromCssColorString('#b7c2ce');

export function lonLatToTile(lon, lat, z = Z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = Cesium.Math.toRadians(Math.max(-85.0511, Math.min(85.0511, lat)));
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

export function tileBounds(x, y, z = Z) {
  const n = 2 ** z;
  const lon = (i) => (i / n) * 360 - 180;
  const lat = (j) => Cesium.Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))));
  return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) };
}

/** Building height in metres from OpenMapTiles properties, with sane defaults. */
export function buildingHeights(props) {
  const base = Math.max(0, Number(props.render_min_height) || 0);
  let top = Number(props.render_height);
  if (!Number.isFinite(top) || top <= 0) top = 6;
  top = Math.min(top, 900);
  return { base, top: Math.max(top, base + 1) };
}

function shade(props, top) {
  let c = BASE_COLOR;
  if (typeof props.colour === 'string' && /^#[0-9a-f]{3,8}$/i.test(props.colour)) {
    c = Cesium.Color.lerp(BASE_COLOR, Cesium.Color.fromCssColorString(props.colour), 0.45, new Cesium.Color());
  }
  // Taller buildings a touch brighter so skylines read at night-vision contrast.
  const k = 0.82 + Math.min(0.22, top / 400);
  return new Cesium.Color(Math.min(1, c.red * k), Math.min(1, c.green * k), Math.min(1, c.blue * k), 1);
}

export function createBuildingLayer(viewer, { onStatus = () => {} } = {}) {
  const { scene } = viewer;
  const collection = scene.primitives.add(new Cesium.PrimitiveCollection());
  const tiles = new Map(); // key → { primitive, count, center, done }
  const credit = new Cesium.Credit(CREDIT_HTML, true);
  let template = null;
  let enabled = false;
  let suspended = false;
  let timer = null;
  let generation = 0;

  async function tileTemplate() {
    if (template) return template;
    try {
      const res = await fetch(TILEJSON);
      const json = await res.json();
      template = json.tiles?.[0] || FALLBACK_TILES;
    } catch {
      template = FALLBACK_TILES;
    }
    return template;
  }

  async function groundGrid(b) {
    const points = [];
    for (let j = 0; j <= GRID; j++)
      for (let i = 0; i <= GRID; i++)
        points.push(
          Cesium.Cartographic.fromDegrees(b.west + ((b.east - b.west) * i) / GRID, b.south + ((b.north - b.south) * j) / GRID),
        );
    const provider = viewer.terrainProvider;
    try {
      if (provider?.availability) await Cesium.sampleTerrainMostDetailed(provider, points);
      else if (!(provider instanceof Cesium.EllipsoidTerrainProvider)) await Cesium.sampleTerrain(provider, 13, points);
    } catch {
      /* fall through to globe heights */
    }
    for (const pt of points) {
      if (!Number.isFinite(pt.height)) pt.height = scene.globe.getHeight(pt) ?? 0;
    }
    return (lon, lat) => {
      const fx = Math.min(GRID, Math.max(0, ((lon - b.west) / (b.east - b.west)) * GRID));
      const fy = Math.min(GRID, Math.max(0, ((lat - b.south) / (b.north - b.south)) * GRID));
      const i = Math.min(GRID - 1, Math.floor(fx));
      const j = Math.min(GRID - 1, Math.floor(fy));
      const tx = fx - i;
      const ty = fy - j;
      const h = (ii, jj) => points[jj * (GRID + 1) + ii].height;
      return (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - ty) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * ty;
    };
  }

  function instancesFor(layer, x, y, ground) {
    const out = [];
    for (let f = 0; f < layer.length; f++) {
      const feature = layer.feature(f);
      const props = feature.properties || {};
      if (props.hide_3d) continue;
      let geo;
      try {
        geo = feature.toGeoJSON(x, y, Z).geometry;
      } catch {
        continue;
      }
      const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
      const { base, top } = buildingHeights(props);
      const color = Cesium.ColorGeometryInstanceAttribute.fromColor(shade(props, top));
      for (const rings of polys) {
        const outer = rings[0];
        if (!outer || outer.length < 4) continue;
        let cx = 0;
        let cy = 0;
        for (let k = 0; k < outer.length - 1; k++) {
          cx += outer[k][0];
          cy += outer[k][1];
        }
        const g = ground(cx / (outer.length - 1), cy / (outer.length - 1));
        const toPositions = (ring) => Cesium.Cartesian3.fromDegreesArray(ring.slice(0, -1).flat());
        const hierarchy = new Cesium.PolygonHierarchy(
          toPositions(outer),
          rings.slice(1).filter((r) => r.length >= 4).map((r) => new Cesium.PolygonHierarchy(toPositions(r))),
        );
        out.push(
          new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
              polygonHierarchy: hierarchy,
              height: g + base - (base ? 0 : 2), // sink ground-level walls slightly into the terrain
              extrudedHeight: g + top,
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: { color },
          }),
        );
      }
    }
    return out;
  }

  async function loadTile(x, y, key, gen) {
    const entry = { primitive: null, count: 0, center: tileBounds(x, y), done: false };
    tiles.set(key, entry);
    try {
      const url = (await tileTemplate()).replace('{z}', Z).replace('{x}', x).replace('{y}', y);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tile = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
      const layer = tile.layers.building;
      if (!layer || !layer.length || gen !== generation || tiles.get(key) !== entry) {
        entry.done = true;
        return;
      }
      const ground = await groundGrid(entry.center);
      if (tiles.get(key) !== entry) return;
      const instances = instancesFor(layer, x, y, ground);
      if (!instances.length) {
        entry.done = true;
        return;
      }
      entry.primitive = collection.add(
        new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, closed: true }),
          asynchronous: true,
          allowPicking: false,
          releaseGeometryInstances: true,
          shadows: Cesium.ShadowMode.DISABLED,
        }),
      );
      entry.count = instances.length;
    } catch (error) {
      console.warn('[buildings] tile failed', key, error);
    }
    entry.done = true;
    report();
  }

  function dropTile(key) {
    const entry = tiles.get(key);
    if (entry?.primitive) collection.remove(entry.primitive);
    tiles.delete(key);
  }

  function viewCenter() {
    const canvas = scene.canvas;
    const hit = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight * 0.6));
    const carto = hit ? Cesium.Cartographic.fromCartesian(hit) : viewer.camera.positionCartographic;
    return { lon: Cesium.Math.toDegrees(carto.longitude), lat: Cesium.Math.toDegrees(carto.latitude) };
  }

  function cameraHeight() {
    const carto = viewer.camera.positionCartographic;
    const ground = scene.globe.getHeight(carto) ?? 0;
    return carto.height - ground;
  }

  function report() {
    if (!enabled) return onStatus('off');
    if (suspended) return onStatus('Google 3D');
    const h = cameraHeight();
    if (h > LOAD_BELOW_M && ![...tiles.values()].some((t) => t.count)) return onStatus('zoom in');
    const pending = [...tiles.values()].some((t) => !t.done);
    const n = [...tiles.values()].reduce((s, t) => s + t.count, 0);
    onStatus(pending ? 'loading…' : n.toLocaleString());
  }

  function update() {
    if (!enabled || suspended) return report();
    const h = cameraHeight();
    collection.show = h < SHOW_BELOW_M;
    if (h > LOAD_BELOW_M) return report();
    const { lon, lat } = viewCenter();
    const c = lonLatToTile(lon, lat);
    const r = h < 3500 ? 2 : 1;
    const wanted = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) wanted.push([c.x + dx, c.y + dy, dx * dx + dy * dy]);
    wanted.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of wanted) {
      const key = `${x}/${y}`;
      if (!tiles.has(key)) loadTile(x, y, key, generation);
    }
    // Evict the farthest tiles once over budget.
    if (tiles.size > MAX_TILES) {
      const byDistance = [...tiles.keys()]
        .map((key) => {
          const [x, y] = key.split('/').map(Number);
          return [key, (x - c.x) ** 2 + (y - c.y) ** 2];
        })
        .sort((a, b) => b[1] - a[1]);
      for (const [key] of byDistance.slice(0, tiles.size - MAX_TILES)) dropTile(key);
    }
    report();
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(update, 250);
  };
  viewer.camera.moveEnd.addEventListener(schedule);
  viewer.camera.percentageChanged = Math.min(viewer.camera.percentageChanged, 0.2);
  viewer.camera.changed.addEventListener(schedule);

  function applyVisibility() {
    const on = enabled && !suspended;
    collection.show = on;
    if (on) viewer.creditDisplay.addStaticCredit(credit);
    else viewer.creditDisplay.removeStaticCredit(credit);
    if (on) schedule();
    report();
  }

  return {
    get show() {
      return enabled;
    },
    set show(on) {
      if (on === enabled) return;
      enabled = on;
      if (!on) {
        generation++;
        for (const key of [...tiles.keys()]) dropTile(key);
      }
      applyVisibility();
    },
    /** Hide while photorealistic 3D tiles are on, which already contain buildings. */
    suspend(on) {
      suspended = on;
      applyVisibility();
    },
    get count() {
      return [...tiles.values()].reduce((s, t) => s + t.count, 0);
    },
    refresh: schedule,
  };
}
