import * as Cesium from 'cesium';
import { horizonOf } from '../app/horizon.js';

/**
 * Launch pads with recent and upcoming launches (Launch Library 2). One glyph
 * per pad; the label shows the next launch, or the most recent one.
 */
function rocketGlyph(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  const g = c.getContext('2d');
  g.translate(20, 20);
  g.shadowColor = color;
  g.shadowBlur = 8;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -15);
  g.quadraticCurveTo(7, -6, 5, 8);
  g.lineTo(-5, 8);
  g.quadraticCurveTo(-7, -6, 0, -15);
  g.fill();
  g.beginPath();
  g.moveTo(-5, 3);
  g.lineTo(-10, 11);
  g.lineTo(-4, 9);
  g.moveTo(5, 3);
  g.lineTo(10, 11);
  g.lineTo(4, 9);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#ff7a45';
  g.beginPath();
  g.moveTo(-3, 10);
  g.lineTo(0, 17);
  g.lineTo(3, 10);
  g.fill();
  return c;
}

export function relativeTime(iso, now = Date.now()) {
  const d = (new Date(iso).getTime() - now) / 1000;
  const a = Math.abs(d);
  const s = a < 3600 ? `${Math.round(a / 60)} min` : a < 172800 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} days`;
  return d >= 0 ? `in ${s}` : `${s} ago`;
}

/** Group launches by pad, soonest upcoming first. */
export function groupByPad(launches, now = Date.now()) {
  const pads = new Map();
  for (const l of launches) {
    if (l.lat == null || l.lon == null) continue;
    const key = `${l.pad}|${l.location}`;
    if (!pads.has(key)) pads.set(key, { pad: l.pad, location: l.location, lat: l.lat, lon: l.lon, launches: [] });
    pads.get(key).launches.push(l);
  }
  for (const p of pads.values()) {
    p.launches.sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
    p.next = p.launches.find((l) => Date.parse(l.net) >= now) || null;
    p.last = [...p.launches].reverse().find((l) => Date.parse(l.net) < now) || null;
  }
  return [...pads.values()];
}

export function createLaunchLayer(viewer) {
  const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  const labels = viewer.scene.primitives.add(new Cesium.LabelCollection());
  const upcomingImg = rocketGlyph('#ffcf5c');
  const pastImg = rocketGlyph('#9aa7b5');
  let pads = [];
  let visible = false;
  // Pads skip the depth test only up to the horizon (see app/horizon.js).
  const horizon = horizonOf(viewer);
  horizon.onChange((d) => {
    for (let i = 0; i < billboards.length; i++) billboards.get(i).disableDepthTestDistance = d;
    for (let i = 0; i < labels.length; i++) labels.get(i).disableDepthTestDistance = d;
  });

  function setLaunches(launches) {
    billboards.removeAll();
    labels.removeAll();
    pads = groupByPad(launches);
    pads.forEach((p, index) => {
      const position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0);
      const id = { layer: 'launch', index };
      billboards.add({
        position,
        image: p.next ? upcomingImg : pastImg,
        width: 26,
        height: 26,
        id,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: horizon.distance,
        scaleByDistance: new Cesium.NearFarScalar(2e5, 1.3, 2e7, 0.7),
      });
      const l = p.next || p.last;
      labels.add({
        position,
        id,
        text: `${l.name.split('|').pop().trim()} · ${relativeTime(l.net)}`,
        font: '600 11px JetBrains Mono, monospace',
        fillColor: Cesium.Color.fromCssColorString(p.next ? '#ffcf5c' : '#c9d3de'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(16, -4),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        disableDepthTestDistance: horizon.distance,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9e6),
      });
    });
    billboards.show = labels.show = visible;
  }

  return {
    setLaunches,
    info: (index) => pads[index],
    get count() {
      return pads.reduce((n, p) => n + p.launches.length, 0);
    },
    get show() {
      return visible;
    },
    set show(on) {
      visible = on;
      billboards.show = labels.show = on;
    },
  };
}
