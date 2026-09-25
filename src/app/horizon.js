import * as Cesium from 'cesium';

/**
 * Markers skip the depth test so terrain and buildings never swallow them,
 * but only out to the horizon. Beyond it they are depth-tested, so the globe
 * hides them. Skipping the test at any distance drew markers from the far
 * side of the Earth on top of the near side, where they seemed to stick to
 * the screen as the globe turned.
 */
const EARTH_RADIUS = 6_371_000;
const MIN_DISTANCE = 20_000; // at street level, keep nearby markers on top of buildings

/** Distance from a camera at `height` metres to its horizon. */
export function horizonDistance(height) {
  const h = Math.max(0, height);
  return Math.max(MIN_DISTANCE, Math.sqrt(h * h + 2 * EARTH_RADIUS * h));
}

const byViewer = new WeakMap();

/**
 * Shared per viewer: `distance` follows the camera every frame, `property`
 * feeds entity graphics, and `onChange` lets primitive collections update.
 */
export function horizonOf(viewer) {
  let h = byViewer.get(viewer);
  if (h) return h;
  let distance = horizonDistance(viewer.camera.positionCartographic.height);
  const listeners = new Set();
  viewer.scene.preRender.addEventListener(() => {
    const next = horizonDistance(viewer.camera.positionCartographic.height);
    if (next === distance) return;
    distance = next;
    for (const fn of listeners) fn(distance);
  });
  h = {
    get distance() {
      return distance;
    },
    property: new Cesium.CallbackProperty(() => distance, false),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  byViewer.set(viewer, h);
  return h;
}
