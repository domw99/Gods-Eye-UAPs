import * as Cesium from 'cesium';
import { AIRSPACE_TYPES } from '../services/airspace.js';

/**
 * Military special-use airspace as translucent 3D volumes, floor to ceiling,
 * with outlines along the ceiling. Heights above 60,000 ft are capped.
 */
const FT = 0.3048;

export function createAirspaceLayer(viewer) {
  const collection = viewer.scene.primitives.add(new Cesium.PrimitiveCollection());
  collection.show = false;
  let areas = [];

  function setAreas(list) {
    collection.removeAll();
    areas = list;
    const instances = [];
    const outlines = new Cesium.PolylineCollection();
    for (const a of list) {
      const type = AIRSPACE_TYPES[a.type] || AIRSPACE_TYPES.R;
      const color = Cesium.Color.fromCssColorString(type.color);
      const floor = Math.max(0, a.lowerFt) * FT;
      const ceiling = Math.min(60000, Math.max(a.upperFt, a.lowerFt + 500)) * FT;
      for (const rings of a.polygons) {
        const outer = Cesium.Cartesian3.fromDegreesArray(rings[0].slice(0, -2));
        if (outer.length < 3) continue;
        instances.push(
          new Cesium.GeometryInstance({
            id: { layer: 'airspace', index: a.index },
            geometry: new Cesium.PolygonGeometry({
              polygonHierarchy: new Cesium.PolygonHierarchy(
                outer,
                rings.slice(1).map((h) => new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(h.slice(0, -2)))),
              ),
              height: floor,
              extrudedHeight: ceiling,
              vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(a.type === 'MOA' ? 0.07 : 0.12)) },
          }),
        );
        outlines.add({
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(
            rings[0].flatMap((v, i) => (i % 2 ? [v, ceiling] : [v])),
          ),
          width: 1.5,
          material: Cesium.Material.fromType('Color', { color: color.withAlpha(0.7) }),
          id: { layer: 'airspace', index: a.index },
        });
      }
    }
    collection.add(
      new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
        asynchronous: true,
        releaseGeometryInstances: true,
      }),
    );
    collection.add(outlines);
  }

  return {
    setAreas,
    info: (index) => areas[index],
    get count() {
      return areas.length;
    },
    get show() {
      return collection.show;
    },
    set show(on) {
      collection.show = on;
    },
  };
}
