import * as Cesium from 'cesium';

/**
 * Zooming out the way map users expect: around the middle of the screen,
 * levelling the tilt as the camera rises, so that from far away the whole
 * globe sits in the centre. Cesium's own zoom-out backs away from the cursor
 * and keeps any tilt, which leaves the Earth off to one side.
 */
export const LEVEL_FROM = 1_500_000; // m from the target: start levelling the tilt
export const LEVEL_AT = 7_000_000; // m: straight down from here on
const MAX_RANGE = 40_000_000;
const DURATION = 380; // ms per zoom step

/** 0 → 1 as x goes from a to b, easing in and out. */
export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The camera pitch to use at `range` from the target when zooming out from `pitch` (radians). */
export function levelledPitch(pitch, range) {
  return pitch + (-Math.PI / 2 - pitch) * smoothstep(LEVEL_FROM, LEVEL_AT, range);
}

/** The next range for a zoom-out by `factor`, capped. */
export const nextRange = (range, factor) => Math.min(MAX_RANGE, range * factor);

/**
 * `blocked()` says when the camera belongs to something else (a chase cam,
 * story mode, the witness view): then zooming is left to Cesium.
 */
export function createZoomOut(viewer, { blocked = () => false } = {}) {
  const { scene, camera } = viewer;
  let anim = null;

  function centerPoint() {
    const c = scene.canvas;
    const px = new Cesium.Cartesian2(c.clientWidth / 2, c.clientHeight / 2);
    const ray = camera.getPickRay(px);
    return (ray && scene.globe.pick(ray, scene)) || camera.pickEllipsoid(px) || null;
  }

  // Where the camera is seen from `target`, as camera.lookAt takes it.
  function orbitOf(target) {
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(target);
    const inv = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
    const local = Cesium.Matrix4.multiplyByPoint(inv, camera.positionWC, new Cesium.Cartesian3());
    const range = Cesium.Cartesian3.magnitude(local);
    return {
      heading: Math.hypot(local.x, local.y) > range * 1e-3 ? Math.atan2(-local.x, -local.y) : camera.heading,
      pitch: Math.asin(Cesium.Math.clamp(-local.z / range, -1, 1)),
      range,
    };
  }

  function step() {
    if (!anim) return;
    const t = Math.min(1, (performance.now() - anim.start) / DURATION);
    const k = 1 - (1 - t) ** 3;
    const { from, to, target } = anim;
    const range = Math.exp(Math.log(from.range) + (Math.log(to.range) - Math.log(from.range)) * k);
    camera.lookAt(target, new Cesium.HeadingPitchRange(from.heading, from.pitch + (to.pitch - from.pitch) * k, range));
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    scene.requestRender();
    if (t < 1) requestAnimationFrame(step);
    else anim = null;
  }

  /** Zoom out by `factor` (range × factor). Quick repeats add up. Returns false when left to Cesium. */
  function zoomOut(factor = 2) {
    if (blocked()) return false;
    camera.cancelFlight();
    const target = anim?.target || centerPoint();
    if (!target) {
      // Nothing of the Earth at the centre: rise straight up over the point below and look down.
      const carto = camera.positionCartographic;
      camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, Math.min(MAX_RANGE, carto.height * factor)),
        orientation: { heading: camera.heading, pitch: -Math.PI / 2, roll: 0 },
        duration: 0.5,
      });
      return true;
    }
    const from = orbitOf(target);
    const range = nextRange(anim ? anim.to.range : from.range, factor);
    if (range <= from.range * 1.001 && from.pitch <= -Math.PI / 2 + 1e-3) return true; // as far out as it goes
    const running = anim;
    anim = { target, from, to: { range, pitch: levelledPitch(from.pitch, range) }, start: performance.now() };
    if (!running) requestAnimationFrame(step);
    return true;
  }

  /**
   * After some other zoom-out (a pinch, a flight) leaves the camera high up
   * and tilted, level it over the point at the centre of the screen.
   */
  function levelIfHigh() {
    if (anim || blocked()) return;
    const carto = camera.positionCartographic;
    if (carto.height < LEVEL_AT * 0.9 || camera.pitch < Cesium.Math.toRadians(-78)) return;
    const target = centerPoint();
    const at = target ? Cesium.Cartographic.fromCartesian(target) : carto;
    camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(at.longitude, at.latitude, carto.height),
      orientation: { heading: camera.heading, pitch: -Math.PI / 2, roll: 0 },
      duration: 0.7,
    });
  }

  return {
    zoomOut,
    levelIfHigh,
    /** Stop a zoom in progress (the user took the camera). */
    cancel() {
      anim = null;
    },
    get zooming() {
      return anim !== null;
    },
  };
}
