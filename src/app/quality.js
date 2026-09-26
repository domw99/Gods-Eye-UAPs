import * as Cesium from 'cesium';

/**
 * Rendering budget. The globe is drawn on demand: Cesium renders when the
 * camera, the clock, terrain or imagery change, and the app asks for frames
 * while something animates. A still globe then costs almost nothing, which
 * keeps the panels and scrolling smooth and saves battery.
 *
 * A still view is always drawn at the screen's full sharpness. Only while
 * the view moves (camera, playback, animations) does it render at a lower
 * pixel ratio, which drops further if frames get slow; a moment after the
 * motion stops the next frame is sharp again.
 */
const IDLE_MS = 500; // a slow heartbeat catches anything that changed without asking
const SETTLE_MS = 180; // this long after the last moving frame, draw a sharp one

export function deviceProfile() {
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const memory = navigator.deviceMemory ?? 8;
  const dpr = globalThis.devicePixelRatio || 1;
  const low = coarse || memory <= 4;
  return {
    low,
    // At rest: the screen's own pixel ratio (up to 2×), so text, markers and imagery are crisp.
    pixelRatio: Math.min(dpr, 2),
    // While moving: cheaper, especially on phones and tablets.
    motionPixelRatio: low ? Math.min(dpr, 1.25) : Math.min(dpr, 1.5),
    msaa: low ? 1 : dpr >= 1.5 ? 2 : 4,
    fxaa: low,
    // Imagery detail: lower is sharper (more tiles). High-DPI screens get finer tiles.
    screenSpaceError: low ? 2 : dpr >= 1.5 ? 1.25 : 1.5,
    tileCache: low ? 250 : 600,
  };
}

export function createRenderLoop(viewer, profile = deviceProfile()) {
  const { scene } = viewer;
  const dpr = globalThis.devicePixelRatio || 1;
  viewer.useBrowserRecommendedResolution = false;
  const sharpScale = profile.pixelRatio / dpr;
  const baseScale = (profile.motionPixelRatio ?? profile.pixelRatio) / dpr;
  viewer.resolutionScale = sharpScale;
  scene.msaaSamples = profile.msaa;
  scene.postProcessStages.fxaa.enabled = profile.fxaa;
  scene.globe.maximumScreenSpaceError = profile.screenSpaceError;
  scene.globe.tileCacheSize = profile.tileCache;
  scene.globe.preloadSiblings = !profile.low;

  scene.requestRenderMode = true;
  scene.maximumRenderTimeChange = 0; // a running clock renders every frame

  const keepAlive = new Set(); // predicates: while any is true, render every frame
  let raf = 0;
  const pump = () => {
    raf = 0;
    let busy = false;
    for (const fn of keepAlive) if (fn()) busy = true;
    if (!busy) return;
    scene.requestRender();
    raf = requestAnimationFrame(pump);
  };
  const wake = () => {
    scene.requestRender();
    if (!raf) raf = requestAnimationFrame(pump);
  };
  setInterval(() => {
    if (!document.hidden) scene.requestRender();
  }, IDLE_MS);

  // Motion resolution: while the view is in motion (camera moving, clock
  // running, an animation pumping) frames use `scale`, which slow frames
  // lower a step and a run of fast ones raises again. When the motion stops,
  // the view is redrawn at full sharpness. Idle heartbeat frames don't count.
  let last = 0;
  let slow = 0;
  let fast = 0;
  let scale = Math.min(baseScale, sharpScale);
  const minScale = scale * 0.55;
  const maxScale = scale;
  let settle = 0;
  const sharpen = () => {
    settle = 0;
    if (viewer.resolutionScale !== sharpScale) {
      viewer.resolutionScale = sharpScale;
      scene.requestRender();
    }
  };
  const lastView = new Cesium.Matrix4();
  scene.postRender.addEventListener(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    const moved = !Cesium.Matrix4.equalsEpsilon(scene.camera.viewMatrix, lastView, 1e-7);
    Cesium.Matrix4.clone(scene.camera.viewMatrix, lastView);
    const active = moved || viewer.clock.shouldAnimate || raf !== 0;
    if (!active) return;
    clearTimeout(settle);
    settle = setTimeout(sharpen, SETTLE_MS);
    if (viewer.resolutionScale !== scale) viewer.resolutionScale = scale;
    if (dt > 250) return; // the first frame of a new motion: no frame time to judge yet
    if (dt > 34) {
      slow += dt > 80 ? 3 : 1;
      fast = 0;
    } else if (dt < 20) {
      fast++;
      slow = 0;
    }
    if (slow > 30 && scale > minScale) {
      scale = Math.max(minScale, scale * 0.85);
      slow = 0;
    } else if (fast > 90 && scale < maxScale) {
      scale = Math.min(maxScale, scale / 0.85);
      fast = 0;
    }
  });

  return {
    /** Ask for a frame (and keep going while any keep-alive holds). */
    request: wake,
    /** Render continuously while `fn()` returns true; call `request()` when it may have become true. */
    keepAliveWhile(fn) {
      keepAlive.add(fn);
      wake();
      return () => keepAlive.delete(fn);
    },
    /** The resolution used while the view moves (a still view is always at full sharpness). */
    get resolutionScale() {
      return scale;
    },
    profile,
  };
}

