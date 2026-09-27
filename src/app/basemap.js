import * as Cesium from 'cesium';
import { ESRI_CREDIT } from './viewer.js';

/**
 * Map styles under the markers, and an optional overlay of place names and
 * borders. All are Esri's public (keyless) map services, like the default
 * satellite imagery. The choice is remembered in this browser.
 */
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/';

export const BASEMAPS = {
  satellite: { label: 'Satellite', hud: 'ESRI SATELLITE', url: `${ESRI}World_Imagery/MapServer`, credit: ESRI_CREDIT },
  dark: {
    label: 'Dark',
    hud: 'ESRI DARK GRAY',
    url: `${ESRI}Canvas/World_Dark_Gray_Base/MapServer`,
    names: `${ESRI}Canvas/World_Dark_Gray_Reference/MapServer`,
    credit: 'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community',
  },
  streets: { label: 'Streets', hud: 'ESRI STREETS', url: `${ESRI}World_Street_Map/MapServer`, credit: 'Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS' },
  topo: { label: 'Topographic', hud: 'ESRI TOPOGRAPHIC', url: `${ESRI}World_Topo_Map/MapServer`, credit: 'Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors' },
};
// Place names and borders over the satellite map.
const NAMES_URL = `${ESRI}Reference/World_Boundaries_and_Places/MapServer`;
const KEY = 'gods-eye-uap:basemap';
// The names services stop adding detail past city scale; closer in their last
// tiles would be stretched into huge blurred letters, so the names fade out.
const NAMES_FULL = 15_000; // m above the ground: names fully shown above this
const NAMES_GONE = 8_000; // and gone below this


function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { style: saved.style in BASEMAPS ? saved.style : 'satellite', names: Boolean(saved.names) };
  } catch {
    return { style: 'satellite', names: false };
  }
}

async function provider(url, credit) {
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(url, { credit, enablePickFeatures: false });
}

/** `onChange()` is called after the map changes, to redraw. */
export function createBasemap(viewer, { onChange = () => {} } = {}) {
  const layers = viewer.imageryLayers;
  let state = load();
  let namesLayer = null;
  let busy = Promise.resolve();

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  };

  // The dark map comes with its own names; the others take the overlay when it is on.
  const namesUrl = () => BASEMAPS[state.style].names || (state.names && state.style === 'satellite' ? NAMES_URL : null);

  async function applyNames() {
    const url = namesUrl();
    if (namesLayer && namesLayer.__url !== url) {
      layers.remove(namesLayer, true);
      namesLayer = null;
    }
    if (url && !namesLayer) {
      namesLayer = layers.addImageryProvider(await provider(url, BASEMAPS[state.style].credit));
      namesLayer.__url = url;
    }
    keepNamesOnTop();
  }

  async function applyStyle(style) {
    const map = BASEMAPS[style];
    const next = new Cesium.ImageryLayer(await provider(map.url, map.credit));
    const old = layers.get(0);
    if (old) next.brightness = old.brightness; // keep any night dimming
    layers.add(next, 0);
    if (old) layers.remove(old, true);
    viewer.__baseMapName = map.hud;
    if (!/GOOGLE/.test(viewer.__mapName || '')) viewer.__mapName = map.hud;
  }

  function keepNamesOnTop() {
    if (namesLayer && layers.contains(namesLayer)) layers.raiseToTop(namesLayer);
  }

  const run = (fn) => {
    busy = busy.then(fn).catch((e) => console.warn('[map style]', e)).then(() => onChange());
    return busy;
  };

  viewer.scene.preRender.addEventListener(() => {
    if (!namesLayer) return;
    const h = viewer.camera.positionCartographic.height;
    namesLayer.alpha = Math.min(1, Math.max(0, (h - NAMES_GONE) / (NAMES_FULL - NAMES_GONE)));
  });

  // Start with the saved choice (the viewer always starts on satellite).
  if (state.style !== 'satellite') run(() => applyStyle(state.style));
  if (namesUrl()) run(applyNames);

  return {
    get style() {
      return state.style;
    },
    get names() {
      return state.names;
    },
    /** True when the current style draws place names (its own, or the overlay). */
    get showsNames() {
      return Boolean(namesUrl());
    },
    setStyle(style) {
      if (!(style in BASEMAPS) || style === state.style) return busy;
      const previous = state.style;
      state = { ...state, style };
      save();
      return run(async () => {
        try {
          await applyStyle(style);
        } catch (e) {
          // Couldn't reach the map service: keep the map that is showing.
          state = { ...state, style: previous };
          save();
          throw e;
        }
        await applyNames();
      });
    },
    setNames(on) {
      state = { ...state, names: Boolean(on) };
      save();
      return run(applyNames);
    },
    /** Other layers added above the map (city lights) go under the names. */
    keepNamesOnTop,
  };
}
