import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

/**
 * Globe setup. Mirrors God's Eye View's keyless start: Esri World Imagery and
 * Re:Earth ellipsoid terrain with no account needed, OpenStreetMap as the
 * fallback, and optional upgrades from keys in `.env`:
 *   VITE_GOOGLE_MAPS_API_KEY → Google Photorealistic 3D Tiles (direct)
 *   VITE_CESIUM_ION_TOKEN    → Cesium World Terrain + Google 3D via ion
 */
const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN || '').trim();

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

async function loadPhotoreal() {
  if (GOOGLE_KEY) {
    try {
      return await Cesium.createGooglePhotorealistic3DTileset(
        { key: GOOGLE_KEY, onlyUsingWithGoogleGeocoder: true },
        { asynchronouslyLoadImagery: true },
      );
    } catch (error) {
      console.warn('[map] Google 3D tiles (direct) failed', error);
    }
  }
  if (ION_TOKEN) {
    try {
      const resource = await Cesium.IonResource.fromAssetId(2275207, {
        accessToken: ION_TOKEN,
      });
      return await Cesium.Cesium3DTileset.fromUrl(resource, {
        asynchronouslyLoadImagery: true,
      });
    } catch (error) {
      console.warn('[map] Google 3D tiles (ion) failed', error);
    }
  }
  return null;
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

  let mapName = base.name;
  createTerrain().then((terrain) => {
    viewer.terrainProvider = terrain;
  });
  loadPhotoreal().then((tileset) => {
    if (!tileset) return;
    scene.primitives.add(tileset);
    scene.globe.show = true;
    mapName = 'GOOGLE PHOTOREAL 3D';
    viewer.__mapName = mapName;
  });
  viewer.__mapName = mapName;

  // Start on a slightly tilted whole-earth view over the Atlantic.
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-40, 25, 21_000_000),
  });
  return viewer;
}

export { Cesium };
