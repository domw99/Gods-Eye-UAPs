import * as Cesium from 'cesium';
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

export function itemColor(item) {
  if (item.kind === 'official') return KIND_COLORS.official;
  if (item.kind === 'user') return KIND_COLORS.user;
  return STATUS[item.status]?.color || '#00d4ff';
}

export function createItemLayer(viewer) {
  const source = new Cesium.CustomDataSource('uap-items');
  viewer.dataSources.add(source);
  const entities = new Map(); // key -> entity
  let regionRing = null;

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
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { itemKey: item.key },
    });
    entity.__item = item;
    entity.__lat = lat;
    entity.__lon = lon;
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
  }

  function setVisible(visibleKeys) {
    for (const [key, entity] of entities) entity.show = visibleKeys.has(key);
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

  return { source, entities, setItems, setVisible, showRegion, positionOf };
}
