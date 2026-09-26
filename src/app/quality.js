import * as Cesium from 'cesium';

/**
 * Rendering budget. The globe is drawn on demand: Cesium renders when the
 * camera, the clock, terrain or imagery change, and the app asks for frames
 * while something animates. A still globe then costs almost nothing, which
 * keeps the panels and scrolling smooth and saves battery.
 *
 * Antialiasing and pixel ratio suit the device, and the resolution drops a
 * step when frames get slow while the camera moves.
 */
const IDLE_MS = 500; // a slow heartbeat catches anything that changed without asking

export function deviceProfile() {
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const memory = navigator.deviceMemory ?? 8;
  const dpr = globalThis.devicePixelRatio || 1;
  const low = coarse || memory <= 4;
  return {
    low,
    // Phones and tablets: native-looking but cheap. Desktops: sharper on high-DPI screens.
    pixelRatio: low ? Math.min(dpr, 1.25) : Math.min(dpr, 1.5),
    msaa: low ? 1 : dpr >= 1.5 ? 2 : 4,
    fxaa: low,
    screenSpaceError: low ? 2.5 : 1.75,
    tileCache: low ? 150 : 400,
  };
}

export function createRenderLoop(viewer, profile = deviceProfile()) {
  const { scene } = viewer;
  const dpr = globalThis.devicePixelRatio || 1;
  viewer.useBrowserRecommendedResolution = false;
  const baseScale = profile.pixelRatio / dpr;
  viewer.resolutionScale = baseScale;
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

  // Dynamic resolution: while the view is in motion (camera moving, clock
  // running, an animation pumping), slow frames lower the resolution a step
  // and a long run of fast ones restores it. Idle heartbeat frames don't count.
  let last = 0;
  let wasActive = false;
  let slow = 0;
  let fast = 0;
  let scale = baseScale;
  const minScale = baseScale * 0.55;
  const lastView = new Cesium.Matrix4();
  scene.postRender.addEventListener(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    const moved = !Cesium.Matrix4.equalsEpsilon(scene.camera.viewMatrix, lastView, 1e-7);
    Cesium.Matrix4.clone(scene.camera.viewMatrix, lastView);
    const active = moved || viewer.clock.shouldAnimate || raf !== 0;
    const measured = active && wasActive && dt < 2000;
    wasActive = active;
    if (!measured) return;
    if (dt > 34) {
      slow += dt > 80 ? 3 : 1;
      fast = 0;
    } else if (dt < 20) {
      fast++;
      slow = 0;
    }
    if (slow > 30 && scale > minScale) {
      scale = Math.max(minScale, scale * 0.85);
      viewer.resolutionScale = scale;
      slow = 0;
    } else if (fast > 240 && scale < baseScale) {
      scale = Math.min(baseScale, scale / 0.85);
      viewer.resolutionScale = scale;
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
    get resolutionScale() {
      return scale;
    },
    profile,
  };
}

