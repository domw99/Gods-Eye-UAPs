import * as Cesium from 'cesium';

/**
 * Large point layers (Project Blue Book ~10k files, NUFORC ~80k reports)
 * drawn with a PointPrimitiveCollection so they stay fast. Each point's `id`
 * carries { layer, index } for picking.
 */
export function createPointLayer(viewer, { name, color, pixelSize = 5, alpha = 0.85, near = 1.3, far = 0.45 }) {
  const collection = viewer.scene.primitives.add(
    new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT }),
  );
  collection.show = false;
  const base = Cesium.Color.fromCssColorString(color).withAlpha(alpha);
  const points = [];
  let years = [];
  let rowIndex = [];

  function setData(rows, { lat, lon, year, jitter = null }) {
    collection.removeAll();
    points.length = 0;
    years = [];
    rowIndex = [];
    rows.forEach((row, index) => {
      let la = lat(row, index);
      let lo = lon(row, index);
      if (la == null || lo == null) return;
      if (jitter) [la, lo] = jitter(row, index, la, lo);
      const p = collection.add({
        position: Cesium.Cartesian3.fromDegrees(lo, la, 0),
        pixelSize,
        color: base,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.5),
        outlineWidth: pixelSize > 3 ? 1 : 0,
        scaleByDistance: new Cesium.NearFarScalar(1e5, near, 1.5e7, far),
        disableDepthTestDistance: 5e6,
        id: { layer: name, index },
      });
      points.push(p);
      years.push(year(row, index));
      rowIndex.push(index);
    });
  }

  /** predicate(rowIndex, year) → boolean */
  function filter(predicate) {
    let shown = 0;
    for (let i = 0; i < points.length; i++) {
      const show = predicate(rowIndex[i], years[i]);
      points[i].show = show;
      if (show) shown++;
    }
    return shown;
  }

  return {
    collection,
    setData,
    filter,
    get size() {
      return points.length;
    },
    set show(v) {
      collection.show = v;
    },
    get show() {
      return collection.show;
    },
  };
}

/** Deterministic small offset so records sharing a town do not overlap. */
export function townJitter(key, lat, lon, spreadKm = 3) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  const r = (((h >>> 12) % 1000) / 1000) * spreadKm;
  return [lat + (r * Math.cos(a)) / 111.32, lon + (r * Math.sin(a)) / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))];
}
