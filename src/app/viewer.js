import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { translateDom } from '../i18n/index.js';

/**
 * Globe setup. Mirrors God's Eye View's keyless start: Esri World Imagery and
 * Re:Earth ellipsoid terrain with no account needed, OpenStreetMap as the
 * fallback, and optional upgrades:
 *   Google Maps API key → Google Photorealistic 3D Tiles (direct). Set it in
 *                         `.env` (VITE_GOOGLE_MAPS_API_KEY) or paste it in the
 *                         app's Map settings (kept in this browser only).
 *   VITE_CESIUM_ION_TOKEN → Cesium World Terrain + Google 3D via ion
 */
const ENV_GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN || '').trim();
const GOOGLE_KEY_STORAGE = 'gods-eye-uap:google-maps-key';

/** A key the user pasted into Map settings, if any (never sent anywhere but Google). */
export function storedGoogleKey() {
  try {
    return (localStorage.getItem(GOOGLE_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function saveGoogleKey(key) {
  try {
    if (key) localStorage.setItem(GOOGLE_KEY_STORAGE, key.trim());
    else localStorage.removeItem(GOOGLE_KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
}

export const hasEnvGoogleKey = () => Boolean(ENV_GOOGLE_KEY);
export const hasIonToken = () => Boolean(ION_TOKEN);

export const ESRI_CREDIT =
  'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

// Imagery, terrain and 3D tiles come from servers that speak HTTP/2, which carries many requests on one connection: the default of six at a time
// leaves a zoomed-in view waiting on its own queue.
Cesium.RequestScheduler.maximumRequestsPerServer = 18;

/**
 * Esri's imagery needs its service description before the first tile. The
 * layer is handed to the globe at once and fills in when that arrives (the
 * globe's tiles wait for it, so the loading screen still follows the
 * imagery), instead of the whole app waiting for one more round trip before
 * the globe, the case list and the terrain request even start. If Esri
 * cannot be reached, OpenStreetMap takes its place.
 */
function createBaseLayer(viewerReady) {
  const esri = Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    { credit: ESRI_CREDIT, enablePickFeatures: false },
  );
  const layer = Cesium.ImageryLayer.fromProviderAsync(esri);
  layer.errorEvent.addEventListener(async (error) => {
    console.warn('[map] Esri imagery unavailable, using OSM', error);
    const viewer = await viewerReady;
    const layers = viewer.imageryLayers;
    const index = layers.indexOf(layer);
    if (index < 0) return; // another map style has already replaced it
    const osm = new Cesium.ImageryLayer(
      new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/', credit: '© OpenStreetMap contributors' }),
    );
    osm.brightness = layer.brightness; // keep any night dimming
    layers.remove(layer, true);
    layers.add(osm, index);
    if (viewer.__mapName === viewer.__baseMapName) viewer.__mapName = 'OPENSTREETMAP';
    viewer.__baseMapName = 'OPENSTREETMAP';
    viewer.scene.requestRender();
  });
  return { layer, name: 'ESRI SATELLITE' };
}

async function createTerrain() {
  if (ION_TOKEN) {
    try {
      const resource = await Cesium.IonResource.fromAssetId(1, {
        accessToken: ION_TOKEN,
      });
      return await Cesium.CesiumTerrainProvider.fromUrl(resource, {
        requestVertexNormals: true,
      });
    } catch (error) {
      console.warn('[map] ion terrain failed', error);
    }
  }
  try {
    // Re:Earth / Mapterhorn ellipsoidal quantized mesh, CC BY 4.0.
    return await Cesium.CesiumTerrainProvider.fromUrl(
      'https://terrain.reearth.land/cesium-mesh/ellipsoid',
      { credit: 'Terrain © Re:Earth / Mapterhorn (CC BY 4.0)' },
    );
  } catch (error) {
    console.warn('[map] keyless terrain unavailable, flat ellipsoid', error);
    return new Cesium.EllipsoidTerrainProvider();
  }
}

/**
 * Photorealistic 3D tiles, switchable at runtime. Tries the user's own key
 * first, then the build-time key, then Cesium ion.
 */
export function createPhotoreal(viewer, { onChange = () => {} } = {}) {
  let tileset = null;
  let source = null;
  // Loads overlap when someone acts while one is still running (the one at start-up, a key pasted in, the
  // switch pressed twice, 3D turned off). The newest wins: an older one that finishes later drops its tiles
  // (it could not be taken off the globe afterwards) and reports what the newest found.
  let latest = 0;
  let newest = Promise.resolve({ ok: false, error: null });

  function remove() {
    if (tileset) viewer.scene.primitives.remove(tileset);
    tileset = null;
    source = null;
    viewer.__mapName = viewer.__baseMapName;
  }

  async function tryGoogle(key) {
    return Cesium.createGooglePhotorealistic3DTileset(
      { key, onlyUsingWithGoogleGeocoder: true },
      { asynchronouslyLoadImagery: true },
    );
  }

  /** Resolves to { ok, source, error }. */
  function load(options) {
    remove();
    const mine = ++latest;
    newest = attempt(options, mine);
    return newest;
  }

  async function attempt({ key } = {}, mine) {
    const candidates = [];
    if (key) candidates.push(['your Google key', () => tryGoogle(key)]);
    else {
      const stored = storedGoogleKey();
      if (stored) candidates.push(['your Google key', () => tryGoogle(stored)]);
      if (ENV_GOOGLE_KEY) candidates.push(['Google (site key)', () => tryGoogle(ENV_GOOGLE_KEY)]);
      if (ION_TOKEN)
        candidates.push([
          'Google via Cesium ion',
          async () =>
            Cesium.Cesium3DTileset.fromUrl(await Cesium.IonResource.fromAssetId(2275207, { accessToken: ION_TOKEN }), {
              asynchronouslyLoadImagery: true,
            }),
        ]);
    }
    let error = null;
    for (const [label, make] of candidates) {
      try {
        const ts = await make();
        if (mine !== latest) {
          ts.destroy?.();
          return newest;
        }
        tileset = viewer.scene.primitives.add(ts);
        source = label;
        viewer.__mapName = 'GOOGLE PHOTOREAL 3D';
        onChange({ active: true, source });
        return { ok: true, source };
      } catch (e) {
        console.warn(`[map] photoreal 3D (${label}) failed`, e);
        error = e;
      }
    }
    if (mine !== latest) return newest;
    onChange({ active: false, source: null, error });
    return { ok: false, error };
  }

  return {
    load,
    unload() {
      latest++;
      newest = Promise.resolve({ ok: false, error: null });
      remove();
      onChange({ active: false, source: null });
    },
    get active() {
      return Boolean(tileset);
    },
    get source() {
      return source;
    },
    /** True when some key or token is configured, so loading is worth trying at boot. */
    get configured() {
      return Boolean(storedGoogleKey() || ENV_GOOGLE_KEY || ION_TOKEN);
    },
  };
}

export async function createViewer(container) {
  // Never fall back to Cesium's shared demo token.
  Cesium.Ion.defaultAccessToken = ION_TOKEN || '';

  let viewerReady;
  const base = createBaseLayer(new Promise((resolve) => (viewerReady = resolve)));
  const terrain = createTerrain();
  // Building the viewer holds the page for a moment (WebGL, shaders), and the browser only sends a
  // request once the page lets go: yield once so the imagery and terrain descriptions, and the
  // catalogue fetch started before this, are on the wire while it builds.
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Cesium's own star field is only a stand-in for the NASA sky (loadStarSky), so it starts hidden and is
  // never downloaded: its 0.9 MB of pictures competed with the first map tiles. It shows only if the
  // NASA sky cannot load.
  const standInSky = Cesium.SkyBox.createEarthSkyBox();
  standInSky.show = false;
  const viewer = new Cesium.Viewer(container, {
    baseLayer: base.layer,
    skyBox: standInSky,
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
    requestRenderMode: false,
    msaaSamples: 4,
  });

  const { scene } = viewer;
  scene.globe.enableLighting = false;
  scene.globe.depthTestAgainstTerrain = false;
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#05070c');
  scene.backgroundColor = Cesium.Color.fromCssColorString('#020306');
  scene.fog.enabled = true;
  scene.skyAtmosphere.show = true;
  scene.globe.showGroundAtmosphere = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 50;
  scene.postProcessStages.fxaa.enabled = true;
  viewer.cesiumWidget.creditContainer.style.display = 'block';
  translateDom(container); // Cesium's own labels (the data attribution box) are built after the first pass

  terrain.then((provider) => {
    viewer.terrainProvider = provider;
  });
  viewer.__baseMapName = base.name;
  viewer.__mapName = base.name;
  viewerReady(viewer);

  // Start on a slightly tilted whole-earth view over the Atlantic.
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-40, 25, 21_000_000),
  });
  return viewer;
}

/**
 * The sky behind the globe: NASA's Deep Star Maps 2020 (Hipparcos-2, Tycho-2
 * and Gaia DR2 stars; NASA/Goddard SVS), as six 2048-px cube faces made by
 * scripts/build-skybox.py. Loaded once the first map tiles are in, so it does
 * not compete with them; until it arrives the sky behind the globe is dark,
 * and if it cannot load, Cesium's own star field is shown instead.
 */
export async function loadStarSky(viewer, base, { small = false } = {}) {
  const faces = { positiveX: 'px', negativeX: 'mx', positiveY: 'py', negativeY: 'my', positiveZ: 'pz', negativeZ: 'mz' };
  // Six 2048-pixel faces take about 100 MB of video memory; phones get 1024-pixel ones.
  const dir = small ? 'skybox/1k/' : 'skybox/';
  try {
    const images = await Promise.all(Object.values(faces).map((f) => Cesium.Resource.fetchImage({ url: `${base}${dir}${f}.jpg` })));
    const sources = Object.fromEntries(Object.keys(faces).map((k, i) => [k, images[i]]));
    const old = viewer.scene.skyBox;
    viewer.scene.skyBox = new Cesium.SkyBox({ sources });
    if (old && !old.isDestroyed?.()) old.destroy();
    viewer.scene.requestRender();
  } catch (e) {
    console.warn('[sky] using the default star field', e);
    if (viewer.scene.skyBox && !viewer.scene.skyBox.isDestroyed?.()) viewer.scene.skyBox.show = true;
    viewer.scene.requestRender();
  }
}

export { Cesium };
