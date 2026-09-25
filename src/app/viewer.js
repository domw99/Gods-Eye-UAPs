import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

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

async function createBaseLayer() {
  try {
    const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
      { credit: ESRI_CREDIT, enablePickFeatures: false },
    );
    return { layer: new Cesium.ImageryLayer(provider), name: 'ESRI SATELLITE' };
  } catch (error) {
    console.warn('[map] Esri imagery unavailable, using OSM', error);
    const provider = new Cesium.OpenStreetMapImageryProvider({
      url: 'https://tile.openstreetmap.org/',
      credit: '© OpenStreetMap contributors',
    });
    return { layer: new Cesium.ImageryLayer(provider), name: 'OPENSTREETMAP' };
  }
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
  async function load({ key } = {}) {
    remove();
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
    onChange({ active: false, source: null, error });
    return { ok: false, error };
  }

  return {
    load,
    unload() {
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

  const base = await createBaseLayer();
  const viewer = new Cesium.Viewer(container, {
    baseLayer: base.layer,
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

  createTerrain().then((terrain) => {
    viewer.terrainProvider = terrain;
  });
  viewer.__baseMapName = base.name;
  viewer.__mapName = base.name;

  // Start on a slightly tilted whole-earth view over the Atlantic.
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-40, 25, 21_000_000),
  });
  return viewer;
}

export { Cesium };
