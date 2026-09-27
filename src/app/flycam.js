import * as Cesium from 'cesium';

/**
 * Two ways to move the camera without the mouse:
 * - Orbit: circle slowly around whatever is at the middle of the screen.
 * - Arrow keys: fly forward, back and sideways over the ground (speed scales
 *   with height); with Shift they turn and tilt the view around the middle
 *   of the screen. Held keys move every frame, so motion is smooth.
 * `blocked()` says when the camera belongs to something else (a chase cam,
 * story mode, the witness view).
 */
const ORBIT_DEG_PER_S = 6;
const TURN_DEG_PER_S = 45;

export function createFlycam(viewer, { blocked = () => false, onMove = () => {} } = {}) {
  const { scene, camera } = viewer;
  const held = new Set();
  let orbit = null; // { target }
  let last = 0;

  function centerPoint() {
    const c = scene.canvas;
    const px = new Cesium.Cartesian2(c.clientWidth / 2, c.clientHeight / 2);
    const ray = camera.getPickRay(px);
    return (ray && scene.globe.pick(ray, scene)) || camera.pickEllipsoid(px) || null;
  }

  // Rotate around `target`: `right` turns the view (heading), `up` tilts it (radians).
  function around(target, right, up) {
    camera.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(target));
    if (right) camera.rotateRight(right);
    if (up) {
      // Keep the tilt between looking straight down and just above the horizon.
      const pitch = camera.pitch;
      const limited = Math.max(-Math.PI / 2 + 0.01 - pitch, Math.min(-0.05 - pitch, -up));
      camera.rotateUp(-limited);
    }
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  // A direction along the ground: the camera's `vector` with its vertical part removed.
  function flat(vector, fallback) {
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(camera.positionWC, new Cesium.Cartesian3());
    const v = Cesium.Cartesian3.subtract(vector, Cesium.Cartesian3.multiplyByScalar(up, Cesium.Cartesian3.dot(vector, up), new Cesium.Cartesian3()), new Cesium.Cartesian3());
    if (Cesium.Cartesian3.magnitude(v) < 1e-3) return fallback ? flat(fallback) : null;
    return Cesium.Cartesian3.normalize(v, v);
  }

  scene.preRender.addEventListener(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (blocked()) {
      orbit = null;
      return;
    }
    if (orbit) around(orbit.target, Cesium.Math.toRadians(ORBIT_DEG_PER_S) * dt, 0);
    if (!held.size || !dt) return;
    const shift = held.has('Shift');
    const turn = Cesium.Math.toRadians(TURN_DEG_PER_S) * dt;
    const x = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
    const y = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
    if (shift) {
      const target = centerPoint();
      if (target) around(target, -x * turn, y * turn);
    } else {
      const height = Math.max(50, camera.positionCartographic.height);
      const step = height * 0.9 * dt; // about one camera height per second
      const forward = flat(camera.directionWC, camera.upWC);
      const right = flat(camera.rightWC);
      if (forward && y) camera.move(forward, y * step);
      if (right && x) camera.move(right, x * step);
    }
    onMove();
  });

  const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  return {
    /** Handle a key event; returns true when it was a camera key. */
    key(e, down) {
      if (e.key === 'Shift') {
        if (down) held.add('Shift');
        else held.delete('Shift');
        return false;
      }
      if (!ARROWS.has(e.key)) return false;
      if (down) {
        if (blocked()) return false;
        held.add(e.key);
        orbit = null;
      } else held.delete(e.key);
      onMove();
      return true;
    },
    /** Let go of every key (the window lost focus). */
    release() {
      held.clear();
    },
    get moving() {
      return held.size > 0 && [...held].some((k) => ARROWS.has(k));
    },
    toggleOrbit() {
      if (orbit || blocked()) return this.stopOrbit();
      const target = centerPoint();
      if (!target) return false;
      camera.cancelFlight();
      orbit = { target };
      onMove();
      return true;
    },
    stopOrbit() {
      const was = Boolean(orbit);
      orbit = null;
      return was && false;
    },
    get orbiting() {
      return orbit !== null;
    },
  };
}
