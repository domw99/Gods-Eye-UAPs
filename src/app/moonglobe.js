import * as Cesium from 'cesium';
import { loadStarSky } from './viewer.js';
import { createEffects } from './effects.js';
import { sunOnMoon } from './moonsun.js';
import { MOON_INK, moonGroup } from '../data/moon.js';

/**
 * The Moon as a globe you can turn and zoom, like the Earth one. Cesium draws
 * it on the Moon's own ellipsoid (radius 1,737.4 km). The pictures are NASA's:
 * the Lunar Reconnaissance Orbiter Camera's global mosaic and the laser
 * altimeter's colour-shaded relief, both from NASA Moon Trek. A copy of the
 * mosaic at low resolution travels with the app, so the Moon still turns
 * offline.
 */
const MOON = Cesium.Ellipsoid.MOON;
const TREK = 'https://trek.nasa.gov/tiles/Moon/EQ/';
const TILES = '1.0.0/default/default028mm/{z}/{y}/{x}';

export const MOON_STYLES = {
  photo: {
    label: 'PHOTO',
    url: `${TREK}LRO_WAC_Mosaic_Global_303ppd_v02/${TILES}.jpg`,
    maximumLevel: 8,
    credit: 'Imagery: NASA/GSFC/Arizona State University (LRO Camera mosaic), via NASA Moon Trek',
  },
  // Laid over the photograph, which keeps the fine detail when you zoom past the relief's resolution
  // (the service has these tiles to zoom level 5, though it lists more).
  relief: {
    label: 'RELIEF',
    url: `${TREK}LRO_LOLA_ClrShade_Global_128ppd_v04/${TILES}.png`,
    maximumLevel: 5,
    alpha: 0.72,
    credit: 'Elevation: NASA/GSFC/MIT (LRO laser altimeter), via NASA Moon Trek',
  },
};

/**
 * Label look by tier. `reach` is how far away the camera may be for the label
 * to show, as a share of the height the whole-Moon view looks from: tier 1
 * names are always there, tier 2 appear once you have moved in a little,
 * tier 3 when you are close.
 */
const TIER = {
  1: { reach: Infinity, font: '600 13px Inter, system-ui, sans-serif' },
  2: { reach: 0.85, font: '500 12px Inter, system-ui, sans-serif' },
  3: { reach: 0.5, font: '500 11px Inter, system-ui, sans-serif' },
};
const INK = MOON_INK;
const groupOf = moonGroup;
const HOME = { lat: 8, lon: 0 };
const SURFACE = 1500; // m above the ground for pins and labels, so the globe doesn't clip them

export const atMoon = (lat, lon, height = 0) => Cesium.Cartesian3.fromDegrees(lon, lat, height, MOON);

/** A round pin with text, drawn at twice its size so it stays sharp on dense screens. */
function pinImage(text, { fill, ink = '#04101a', size = 30, ring = false }) {
  const px = size * 2;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.translate(px / 2, px / 2);
  g.beginPath();
  g.arc(0, 0, px / 2 - 4, 0, Math.PI * 2);
  if (ring) {
    g.lineWidth = 5;
    g.strokeStyle = fill;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, px / 2 - 15, 0, Math.PI * 2);
    g.lineWidth = 3;
    g.stroke();
  } else {
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.stroke();
  }
  if (text) {
    g.fillStyle = ink;
    g.font = `700 ${Math.round(px * 0.46)}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 0, 2);
  }
  return c;
}

/** A diamond for a landing site. */
function siteImage(fill) {
  const c = document.createElement('canvas');
  c.width = c.height = 36;
  const g = c.getContext('2d');
  g.translate(18, 18);
  g.beginPath();
  g.moveTo(0, -13);
  g.lineTo(13, 0);
  g.lineTo(0, 13);
  g.lineTo(-13, 0);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.stroke();
  return c;
}

/**
 * @param {HTMLElement} container     where the globe goes
 * @param {object} o
 * @param {string} o.base             the app's base URL (for the offline picture and the stars)
 * @param {HTMLElement} [o.creditContainer]
 * @param {object} [o.profile]        the device's rendering budget (from deviceProfile): pixel ratio, smoothing, tile cache
 * @param {(key: string|null) => void} [o.onSelect]   a pin or label was clicked (null: empty ground)
 * @param {(key: string|null, at: {x: number, y: number}|null) => void} [o.onHover]
 * @param {(view: {lat: number, lon: number, height: number}) => void} [o.onView]  the camera moved
 * @param {(at: {lat: number, lon: number}|null) => void} [o.onPointer]  the ground under the pointer
 * @param {() => void} [o.onOffline]  NASA's detailed tiles can't be reached
 * @param {() => number} [o.coveredTop]  how many pixels at the top of the globe the top bar hides
 */
export async function createMoonGlobe(container, { base, creditContainer, profile = {}, onSelect, onHover, onView, onPointer, onOffline, coveredTop } = {}) {
  const viewer = new Cesium.Viewer(container, {
    ellipsoid: MOON,
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    msaaSamples: profile.msaa ?? 4,
    creditContainer,
  });
  const low = Boolean(profile.low);
  const { scene, camera, entities } = viewer;
  scene.globe.enableLighting = false;
  scene.globe.showGroundAtmosphere = false;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  // Cesium turns the shading off close to the ground (for the Earth's sake); on the Moon it stays at every height.
  scene.globe.lightingFadeOutDistance = 0;
  scene.globe.lightingFadeInDistance = 1;
  // No air to scatter the light: the lit side is bright almost to the terminator, and the night side
  // shows only by earthshine.
  scene.globe.lambertDiffuseMultiplier = 2.6;
  scene.globe.vertexShadowDarkness = 0.1;
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#101114');
  scene.backgroundColor = Cesium.Color.fromCssColorString('#020306');
  scene.fog.enabled = false;
  scene.postProcessStages.fxaa.enabled = Boolean(profile.fxaa);
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = (profile.pixelRatio ?? globalThis.devicePixelRatio ?? 1) / (globalThis.devicePixelRatio || 1);
  scene.globe.maximumScreenSpaceError = profile.screenSpaceError ?? 1.5;
  scene.globe.tileCacheSize = profile.tileCache ?? 300;
  const controls = scene.screenSpaceCameraController;
  controls.minimumZoomDistance = 1500;
  controls.maximumZoomDistance = 30_000_000;
  viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  // The picture that travels with the app, under NASA's tiles.
  try {
    const offline = await Cesium.SingleTileImageryProvider.fromUrl(`${base}space/moon-wac-2k.jpg`, {
      rectangle: Cesium.Rectangle.MAX_VALUE,
      ellipsoid: MOON,
    });
    viewer.imageryLayers.addImageryProvider(offline);
  } catch (error) {
    console.warn('[moon] the low-resolution picture did not load; NASA’s tiles alone will show', error);
  }

  const tiling = new Cesium.GeographicTilingScheme({ ellipsoid: MOON });
  const provider = (def) => {
    const p = new Cesium.UrlTemplateImageryProvider({
      url: def.url,
      tilingScheme: tiling,
      tileWidth: 256,
      tileHeight: 256,
      maximumLevel: def.maximumLevel,
      credit: def.credit,
      enablePickFeatures: false,
    });
    p.errorEvent.addEventListener(() => {}); // a missing tile leaves the coarser picture showing
    return p;
  };
  let told = false;
  /** NASA's tiles: one quick request tells whether they can be reached at all (the picture that travels with the app shows meanwhile). */
  function probe(def) {
    fetch(def.url.replace('{z}', '0').replace('{y}', '0').replace('{x}', '0'))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      })
      .catch(() => {
        if (told) return;
        told = true;
        onOffline?.();
      });
  }
  viewer.imageryLayers.addImageryProvider(provider(MOON_STYLES.photo));
  probe(MOON_STYLES.photo);
  let light = 'off'; // see setLight
  /** Night by earthshine: the pictures dimmed and greyed. */
  function shadeLayers() {
    for (let i = 0; i < viewer.imageryLayers.length; i++) {
      const layer = viewer.imageryLayers.get(i);
      layer.brightness = light === 'night' ? 0.42 : 1;
      layer.saturation = light === 'night' ? 0.35 : 1;
    }
  }
  let reliefLayer = null;
  let style = 'photo';
  function useStyle(id) {
    if (!MOON_STYLES[id] || id === style) return;
    style = id;
    if (reliefLayer) viewer.imageryLayers.remove(reliefLayer, true);
    reliefLayer = null;
    if (id === 'relief') {
      reliefLayer = viewer.imageryLayers.addImageryProvider(provider(MOON_STYLES.relief));
      reliefLayer.alpha = MOON_STYLES.relief.alpha;
      probe(MOON_STYLES.relief);
      shadeLayers();
    }
    scene.requestRender();
  }

  // Stars behind it, where there is video memory to spare.
  if (!low) loadStarSky(viewer, base, { small: true });

  // ── Places ──
  const images = {
    report: new Map(),
    site: siteImage(INK.site),
    ring: pinImage('', { fill: '#ffffff', size: 44, ring: true }),
  };
  let namesOn = true;
  let selectedId = null;
  let raised = null; // a name moved off the selection ring, to put back
  let hoverId = null;
  let shown = { report: true, site: true, sea: true, crater: true, range: true };
  const groupById = new Map(); // entity id → its group

  // On a small screen the whole Moon is too small for even the main names: they appear at the first step in.
  const small = () => Math.min(scene.canvas.clientWidth || 1000, scene.canvas.clientHeight || 800) < 420;
  const reachOf = (tier) => {
    const reach = tier === 1 && small() ? TIER[2].reach : TIER[tier].reach;
    return Number.isFinite(reach) ? reach * homeHeight() : 1e9;
  };
  const label = (text, { kind, tier = 2, offset = false, size, dy = 0 }) => ({
    text,
    font: size || (offset ? '600 12px Inter, system-ui, sans-serif' : TIER[tier].font),
    fillColor: Cesium.Color.fromCssColorString(INK[kind]),
    outlineColor: Cesium.Color.fromCssColorString('#000000').withAlpha(0.9),
    outlineWidth: 4,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    horizontalOrigin: offset ? Cesium.HorizontalOrigin.LEFT : Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    // Names sit just below their place, so a pin on the place doesn't hide them; sites' names sit beside the diamond.
    pixelOffset: offset ? new Cesium.Cartesian2(24, dy) : new Cesium.Cartesian2(0, 11 + dy),
    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, reachOf(tier)),
    translucencyByDistance: new Cesium.NearFarScalar(reachOf(tier) * 0.7, 1, reachOf(tier), 0.2),
    show: namesOn,
  });

  /** Put the places and the numbered reports on the globe. Keys: `place:<id>`, `report:<id>`. */
  function setPlaces({ places = [], reports = [] }) {
    entities.removeAll();
    groupById.clear();
    selectedId = null;
    raised = null;
    for (const p of places) {
      const id = `place:${p.id}`;
      const isSite = p.kind === 'site';
      groupById.set(id, groupOf(p.kind));
      entities.add({
        id,
        name: p.name,
        show: shown[groupOf(p.kind)] !== false,
        position: atMoon(p.lat, p.lon, SURFACE),
        ...(isSite
          ? { billboard: { image: images.site, scale: 0.5, distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1e9) } }
          : {}),
        label: label(p.name, { kind: p.kind, tier: p.tier, offset: isSite, dy: p.dy }),
      });
    }
    for (const r of reports) {
      for (const [i, site] of r.sites.entries()) {
        const id = i === 0 ? `report:${r.entry.id}` : `report:${r.entry.id}#${i}`;
        if (!images.report.has(r.n)) images.report.set(r.n, pinImage(String(r.n), { fill: '#00d4ff', ink: '#001018' }));
        groupById.set(id, 'report');
        entities.add({
          id,
          name: r.entry.title,
          show: shown.report !== false,
          position: atMoon(site.lat, site.lon, SURFACE * 2),
          billboard: { image: images.report.get(r.n), scale: 0.5, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -2) },
        });
      }
    }
    scene.requestRender();
  }

  /** Show or hide groups of places: { report, site, sea, crater, range }. */
  function setGroups(next) {
    shown = { ...shown, ...next };
    for (const e of entities.values) {
      const g = groupById.get(e.id);
      if (g) e.show = shown[g] !== false;
    }
    scene.requestRender();
  }

  function setNames(on) {
    namesOn = on;
    for (const e of entities.values) if (e.label) e.label.show = on;
    scene.requestRender();
  }

  function select(key, at) {
    if (selectedId) entities.removeById(selectedId);
    if (raised) raised.label.pixelOffset = raised.was;
    raised = null;
    selectedId = null;
    if (key && at) {
      selectedId = '__selected';
      // Between the places (at SURFACE) and the report pins (at twice that), so a numbered pin stays in front of its ring.
      entities.add({ id: selectedId, position: atMoon(at.lat, at.lon, SURFACE * 1.5), billboard: { image: images.ring, scale: 0.5, disableDepthTestDistance: 0 } });
      // A name written across the middle of the place sits under the ring: move it below.
      const named = entities.getById(key);
      if (named?.label && !named.billboard) {
        raised = { label: named.label, was: named.label.pixelOffset };
        named.label.pixelOffset = new Cesium.Cartesian2(0, 34);
      }
    }
    scene.requestRender();
  }

  // ── Camera ──
  const toDeg = Cesium.Math.toDegrees;
  function where() {
    const c = camera.positionCartographic;
    return { lat: toDeg(c.latitude), lon: toDeg(c.longitude), height: c.height };
  }
  function flyTo({ lat, lon, height = 600_000 }, { duration = 1.8 } = {}) {
    camera.flyTo({
      destination: atMoon(lat, lon, height),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      duration,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    });
  }
  /** How high to look from so the whole Moon fills about three quarters of the shorter side, clear of the top bar. */
  function homeHeight() {
    const w = scene.canvas.clientWidth || 1000;
    const h = scene.canvas.clientHeight || 800;
    // The field of view spans the longer side.
    const focal = Math.max(w, h) / 2 / Math.tan(camera.frustum.fov / 2);
    const radius = Math.max(60, Math.min(0.39 * Math.min(w, h), h / 2 - Math.max(0, coveredTop?.() || 0) - 14)); // on screen, in pixels
    const distance = MOON.maximumRadius * Math.sqrt(1 + (focal / radius) ** 2);
    return distance - MOON.maximumRadius;
  }
  let framed = 0; // the height the whole-Moon view last looked from
  const home = (duration) => {
    framed = homeHeight();
    flyTo({ ...HOME, height: framed }, { duration });
  };
  camera.setView({ destination: atMoon(HOME.lat, HOME.lon, homeHeight() * 1.6), orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 } });
  home(2.2);

  function zoom(factor) {
    camera.cancelFlight(); // a key press takes over from a flight in progress
    const { height } = where();
    // factor > 1 zooms in
    const amount = height * (1 - 1 / factor);
    if (factor > 1) camera.zoomIn(amount);
    else camera.zoomOut(height * (1 / factor - 1));
    scene.requestRender();
  }

  /** Move the view east (dx > 0) or north (dy > 0) over the Moon, as the arrow keys do; closer in, the steps are smaller. */
  function turn(dx, dy) {
    camera.cancelFlight();
    const { height } = where();
    const step = Cesium.Math.clamp(height / (MOON.maximumRadius + height), 0.03, 1) * 0.35;
    if (dx) (dx > 0 ? camera.rotateRight : camera.rotateLeft).call(camera, Math.abs(dx) * step);
    if (dy) (dy > 0 ? camera.rotateDown : camera.rotateUp).call(camera, Math.abs(dy) * step);
    scene.requestRender();
  }

  // ── Sensor looks and lighting, as on the Earth ──
  const effects = createEffects(viewer);
  let pulse = 0;
  const lessMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /** A sensor look (normal, nvg, flir, …); the grain is redrawn about 15 times a second. */
  function setMode(mode) {
    const m = effects.set(mode);
    clearInterval(pulse);
    if (m !== 'normal' && !lessMotion()) pulse = setInterval(() => !document.hidden && scene.requestRender(), 66);
    scene.requestRender();
    return m;
  }
  const flatLight = scene.light;
  const viewLight = new Cesium.DirectionalLight({ direction: Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_X) });
  const stopFollow = scene.preRender.addEventListener(() => {
    if (light === 'day') Cesium.Cartesian3.clone(camera.directionWC, viewLight.direction);
  });
  /**
   * off: evenly lit. day: lit from where you look. night: by earthshine, dim
   * and grey. moment: by the Sun as it stood at `at` (a Date).
   */
  function setLight(mode, at) {
    light = mode === 'moment' && !at ? 'off' : mode;
    if (light === 'moment') {
      const sun = sunOnMoon(at);
      // The light travels from the Sun, so it points the other way.
      scene.light = new Cesium.DirectionalLight({ direction: new Cesium.Cartesian3(-sun.x, -sun.y, -sun.z) });
    } else scene.light = light === 'day' ? viewLight : flatLight;
    scene.globe.enableLighting = light === 'moment' || light === 'day';
    shadeLayers();
    scene.requestRender();
  }

  camera.percentageChanged = 0.01;
  const stopChanged = camera.changed.addEventListener(() => onView?.(where()));
  const stopMove = camera.moveEnd.addEventListener(() => onView?.(where()));

  // ── Pointer ──
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  const idOf = (position) => {
    const picked = scene.pick(position);
    const id = Cesium.defined(picked) ? picked.id : null;
    const key = typeof id === 'string' ? id : id?.id;
    return key && key !== '__selected' ? key : null;
  };
  handler.setInputAction((click) => onSelect?.(idOf(click.position)), Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction((move) => {
    const key = idOf(move.endPosition);
    if (key !== hoverId) {
      hoverId = key;
      scene.canvas.style.cursor = key ? 'pointer' : '';
      onHover?.(key, key ? { x: move.endPosition.x, y: move.endPosition.y } : null);
    } else if (key) {
      onHover?.(key, { x: move.endPosition.x, y: move.endPosition.y });
    }
    const ground = camera.pickEllipsoid(move.endPosition, MOON);
    if (ground) {
      const c = MOON.cartesianToCartographic(ground);
      onPointer?.({ lat: toDeg(c.latitude), lon: toDeg(c.longitude) });
    } else onPointer?.(null);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  return {
    viewer,
    setPlaces,
    setNames,
    select,
    flyTo,
    home,
    zoom,
    turn,
    where,
    setGroups,
    setMode,
    setLight,
    get light() {
      return light;
    },
    setStyle: useStyle,
    get style() {
      return style;
    },
    /** The canvas changed size. If the whole Moon was in view, it is framed again for the new size. */
    resize() {
      const wasHome = camera.positionCartographic.height >= framed * 0.8;
      viewer.resize();
      if (wasHome) home(0.4);
      scene.requestRender();
    },
    /** Stop drawing while hidden, or start again. */
    set active(on) {
      viewer.useDefaultRenderLoop = on;
      if (on) scene.requestRender();
    },
    destroy() {
      clearInterval(pulse);
      stopFollow();
      stopChanged();
      stopMove();
      handler.destroy();
      // Browsers keep only a handful of WebGL contexts alive and drop the oldest, which would be the
      // Earth's; so give this one up now instead of waiting for it to be collected.
      const gl = scene.context._gl;
      viewer.destroy();
      gl?.getExtension?.('WEBGL_lose_context')?.loseContext();
    },
  };
}
