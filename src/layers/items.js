import * as Cesium from 'cesium';
import { horizonOf } from '../app/horizon.js';
import { STATUS } from '../data/taxonomy.js';
import { spiralOffset } from '../util/geo.js';

/**
 * Globe markers for curated cases, official releases and the user's log.
 * Glyphs are drawn once to canvases and reused as billboard images.
 */
const glyphCache = new Map();

function glyph(kind, color, emphasis = false) {
  const key = `${kind}|${color}|${emphasis}`;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const s = emphasis ? 40 : 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const m = s / 2;
  g.shadowColor = color;
  g.shadowBlur = 8;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 2;
  if (kind === 'official') {
    g.beginPath();
    g.moveTo(m, 5);
    g.lineTo(s - 5, m);
    g.lineTo(m, s - 5);
    g.lineTo(5, m);
    g.closePath();
    g.globalAlpha = 0.25;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
    g.beginPath();
    g.arc(m, m, 3, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'user') {
    g.beginPath();
    g.moveTo(m, 5);
    g.lineTo(s - 6, s - 7);
    g.lineTo(6, s - 7);
    g.closePath();
    g.globalAlpha = 0.25;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
  } else {
    g.beginPath();
    g.arc(m, m, m - 6, 0, Math.PI * 2);
    g.stroke();
    if (emphasis) {
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(m, m, m - 2, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    g.beginPath();
    g.arc(m, m, 4, 0, Math.PI * 2);
    g.fill();
  }
  glyphCache.set(key, c);
  return c;
}

export const KIND_COLORS = { official: '#ff5ce1', user: '#c6ff5c' };

/* ── Clustering ──────────────────────────────────────────── */
// Markers closer than CLUSTER_PX on screen merge into a numbered cluster
// once there are at least CLUSTER_MIN of them. Below CLUSTER_BELOW_M the
// camera is close enough that markers separate on their own.
const CLUSTER_PX = 38;
const CLUSTER_MIN = 3;
const CLUSTER_BELOW_M = 150_000;
const clusterImages = new Map();

/** A dark disc with a count, ringed in case (cyan) and official (magenta) shares. */
function clusterImage(count, caseShare) {
  const bucket = Math.round(caseShare * 8) / 8;
  const key = `${count}|${bucket}`;
  if (clusterImages.has(key)) return clusterImages.get(key);
  const r = Math.min(24, 15 + Math.log2(count) * 2.2);
  const s = Math.ceil(r * 2 + 10);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const m = s / 2;
  g.fillStyle = 'rgba(5, 9, 16, 0.82)';
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.shadowBlur = 8;
  const start = -Math.PI / 2;
  const split = start + Math.PI * 2 * bucket;
  const arc = (from, to, color) => {
    if (to - from < 1e-3) return;
    g.strokeStyle = g.shadowColor = color;
    g.beginPath();
    g.arc(m, m, r, from, to);
    g.stroke();
  };
  arc(start, split, '#00d4ff');
  arc(split, start + Math.PI * 2, KIND_COLORS.official);
  g.shadowBlur = 0;
  g.fillStyle = '#e8f6ff';
  g.font = `600 ${count > 99 ? 11 : 12}px JetBrains Mono, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(count), m, m + 0.5);
  clusterImages.set(key, c);
  return c;
}

export function itemColor(item) {
  if (item.kind === 'official') return KIND_COLORS.official;
  if (item.kind === 'user') return KIND_COLORS.user;
  return STATUS[item.status]?.color || '#00d4ff';
}

export function createItemLayer(viewer) {
  const horizon = horizonOf(viewer);
  const source = new Cesium.CustomDataSource('uap-items');
  viewer.dataSources.add(source);
  const entities = new Map(); // key -> entity
  let regionRing = null;
  let visibleKeys = null; // null = everything passes the filters
  let selectedKey = null;
  let clusters = []; // [{ members: [item], position }]
  const clusterBoards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  horizon.onChange((d) => {
    for (let i = 0; i < clusterBoards.length; i++) clusterBoards.get(i).disableDepthTestDistance = d;
  });

  function add(item, index = 0) {
    if (item.lat == null || item.lon == null) return;
    let { lat, lon } = item;
    // Spread co-located region-level releases so each pin stays clickable.
    if (item.kind === 'official' && item.precision === 'region') {
      const [dLat, dLon] = spiralOffset(index, item.radiusKm || 100, lat);
      lat += dLat;
      lon += dLon;
    }
    const color = itemColor(item);
    const entity = source.entities.add({
      id: item.key,
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      billboard: {
        image: glyph(item.kind, color, item.hasTrack),
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.0, 2e7, 0.55),
        disableDepthTestDistance: horizon.property,
        heightReference: Cesium.HeightReference.NONE,
      },
      label: {
        text: item.title.length > 46 ? `${item.title.slice(0, 44)}…` : item.title,
        font: '500 12px Inter, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#e8eaed'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(16, 0),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, item.kind === 'case' ? 3.5e6 : 9e5),
        disableDepthTestDistance: horizon.property,
      },
      properties: { itemKey: item.key },
    });
    entity.__item = item;
    entity.__lat = lat;
    entity.__lon = lon;
    entity.__pos = Cesium.Cartesian3.fromDegrees(lon, lat);
    entities.set(item.key, entity);
  }

  function setItems(items) {
    source.entities.suspendEvents();
    source.entities.removeAll();
    entities.clear();
    const regionCounters = new Map();
    for (const item of items) {
      let index = 0;
      if (item.kind === 'official' && item.precision === 'region') {
        const k = `${item.lat},${item.lon}`;
        index = regionCounters.get(k) || 0;
        regionCounters.set(k, index + 1);
      }
      add(item, index);
    }
    source.entities.resumeEvents();
    recluster();
  }

  function setVisible(keys) {
    visibleKeys = keys;
    recluster();
  }

  function setSelected(key) {
    selectedKey = key;
    recluster();
  }

  /**
   * Group markers that overlap on screen. Only markers on the side of the
   * Earth facing the camera take part (the globe hides the rest), and the
   * selected marker always stays on its own.
   */
  const scratch = new Cesium.Cartesian2();
  function recluster() {
    const scene = viewer.scene;
    const camera = viewer.camera;
    clusterBoards.removeAll();
    clusters = [];
    const on = camera.positionCartographic.height > CLUSTER_BELOW_M;
    const occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, camera.positionWC);
    const pts = [];
    for (const [key, e] of entities) {
      const visible = !visibleKeys || visibleKeys.has(key);
      e.show = visible;
      if (!visible || !on || key === selectedKey || !occluder.isPointVisible(e.__pos)) continue;
      const w = Cesium.SceneTransforms.worldToWindowCoordinates(scene, e.__pos, scratch);
      if (w) pts.push({ e, x: w.x, y: w.y });
    }
    if (pts.length < CLUSTER_MIN) return;
    // Bucket by screen cell, then grow each group from an unused seed.
    const grid = new Map();
    const cellOf = (p) => `${Math.floor(p.x / CLUSTER_PX)},${Math.floor(p.y / CLUSTER_PX)}`;
    pts.forEach((p, i) => {
      const k = cellOf(p);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    const used = new Uint8Array(pts.length);
    const r2 = CLUSTER_PX * CLUSTER_PX;
    const groups = [];
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const p = pts[i];
      const cx = Math.floor(p.x / CLUSTER_PX);
      const cy = Math.floor(p.y / CLUSTER_PX);
      const group = [i];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const j of grid.get(`${cx + dx},${cy + dy}`) || []) {
            if (j === i || used[j]) continue;
            const q = pts[j];
            if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= r2) group.push(j);
          }
      if (group.length < CLUSTER_MIN) continue;
      for (const j of group) used[j] = 1;
      groups.push(group);
    }
    // Neighbouring groups can still overlap on screen: merge them.
    const centre = (g) => [g.reduce((a, j) => a + pts[j].x, 0) / g.length, g.reduce((a, j) => a + pts[j].y, 0) / g.length];
    const near2 = (CLUSTER_PX * 0.9) ** 2;
    for (let merged = true; merged; ) {
      merged = false;
      outer: for (let a = 0; a < groups.length; a++)
        for (let b = a + 1; b < groups.length; b++) {
          const [ax, ay] = centre(groups[a]);
          const [bx, by] = centre(groups[b]);
          if ((ax - bx) ** 2 + (ay - by) ** 2 < near2) {
            groups[a] = groups[a].concat(groups[b]);
            groups.splice(b, 1);
            merged = true;
            break outer;
          }
        }
    }
    for (const group of groups) {
      const sum = new Cesium.Cartesian3();
      let cases = 0;
      for (const j of group) {
        pts[j].e.show = false;
        Cesium.Cartesian3.add(sum, pts[j].e.__pos, sum);
        if (pts[j].e.__item.kind !== 'official') cases++;
      }
      const position = Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(Cesium.Cartesian3.divideByScalar(sum, group.length, sum), new Cesium.Cartesian3());
      const members = group.map((j) => pts[j].e.__item);
      clusters.push({ members, position, positions: group.map((j) => pts[j].e.__pos) });
      clusterBoards.add({
        position,
        image: clusterImage(group.length, cases / group.length),
        id: { layer: 'cluster', index: clusters.length - 1 },
        disableDepthTestDistance: horizon.distance,
      });
    }
  }

  // Re-group as the camera moves (at most a few times a second) and once it stops.
  let lastCluster = 0;
  let queued = false;
  const lastPos = new Cesium.Cartesian3();
  const lastDir = new Cesium.Cartesian3();
  viewer.scene.preRender.addEventListener(() => {
    const cam = viewer.camera;
    const moved =
      !Cesium.Cartesian3.equalsEpsilon(cam.positionWC, lastPos, 0, 1) ||
      !Cesium.Cartesian3.equalsEpsilon(cam.directionWC, lastDir, 1e-6);
    if (!moved && !queued) return;
    Cesium.Cartesian3.clone(cam.positionWC, lastPos);
    Cesium.Cartesian3.clone(cam.directionWC, lastDir);
    const now = performance.now();
    if (now - lastCluster < 120) {
      queued = true;
      return;
    }
    queued = false;
    lastCluster = now;
    recluster();
  });
  window.addEventListener('resize', () => recluster());

  /** Fly in far enough for a cluster's markers to separate. */
  function zoomToCluster(index) {
    const c = clusters[index];
    if (!c) return;
    const sphere = Cesium.BoundingSphere.fromPoints(c.positions);
    const pitch = Math.min(Cesium.Math.toRadians(-50), viewer.camera.pitch);
    viewer.camera.flyToBoundingSphere(sphere, {
      duration: 1.6,
      offset: new Cesium.HeadingPitchRange(viewer.camera.heading, pitch, Math.max(sphere.radius * 3.2, 60_000)),
    });
  }

  function showRegion(item) {
    if (regionRing) {
      viewer.entities.remove(regionRing);
      regionRing = null;
    }
    if (!item || !item.radiusKm || item.lat == null) return;
    const color = Cesium.Color.fromCssColorString(KIND_COLORS.official);
    regionRing = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat),
      ellipse: {
        semiMajorAxis: item.radiusKm * 1000,
        semiMinorAxis: item.radiusKm * 1000,
        material: color.withAlpha(0.07),
        outline: true,
        outlineColor: color.withAlpha(0.8),
        height: 0,
      },
    });
  }

  function positionOf(key) {
    const e = entities.get(key);
    return e ? { lat: e.__lat, lon: e.__lon } : null;
  }

  return {
    source,
    entities,
    setItems,
    setVisible,
    setSelected,
    showRegion,
    positionOf,
    zoomToCluster,
    cluster: (index) => clusters[index] || null,
  };
}
