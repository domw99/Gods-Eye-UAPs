import * as Cesium from 'cesium';

/**
 * Hide labels that would overlap on screen. Candidates are placed in
 * priority order; a label that would cover one already placed is hidden.
 * Each candidate: { entity, position, text, priority, dx, dy, charPx, maxDistance }.
 * Label boxes are estimated from the text length, which is close enough
 * for Inter and JetBrains Mono at 11–12 px.
 */
const scratch = new Cesium.Cartesian2();

export function declutter(scene, candidates) {
  const camera = scene.camera.positionWC;
  const placed = [];
  const sorted = candidates
    .map((c) => {
      const far = c.maxDistance != null && Cesium.Cartesian3.distance(camera, c.position) > c.maxDistance;
      const w = far ? null : Cesium.SceneTransforms.worldToWindowCoordinates(scene, c.position, scratch);
      return { c, x: w?.x, y: w?.y };
    })
    .sort((a, b) => b.c.priority - a.c.priority);
  let changed = false;
  for (const { c, x, y } of sorted) {
    let show = x != null;
    if (show) {
      const box = { x0: x + c.dx - 2, x1: x + c.dx + c.text.length * c.charPx + 16, y0: y + c.dy - 11, y1: y + c.dy + 11 };
      show = !placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
      if (show) placed.push(box);
    }
    if (c.entity.label && c.entity.label.show?.getValue?.() !== show) {
      c.entity.label.show = show;
      changed = true;
    }
  }
  if (changed) scene.requestRender();
}

/** Run `fn` when the camera moves, at most every `ms` and once more after it stops. */
export function onCameraSettle(viewer, fn, ms = 150) {
  let last = 0;
  let timer = null;
  const lastPos = new Cesium.Cartesian3();
  const lastDir = new Cesium.Cartesian3();
  viewer.scene.preRender.addEventListener(() => {
    const cam = viewer.camera;
    if (Cesium.Cartesian3.equalsEpsilon(cam.positionWC, lastPos, 0, 1) && Cesium.Cartesian3.equalsEpsilon(cam.directionWC, lastDir, 1e-6)) return;
    Cesium.Cartesian3.clone(cam.positionWC, lastPos);
    Cesium.Cartesian3.clone(cam.directionWC, lastDir);
    const now = performance.now();
    clearTimeout(timer);
    if (now - last >= ms) {
      last = now;
      fn();
    }
    timer = setTimeout(() => {
      last = performance.now();
      fn();
    }, ms + 20);
  });
}
