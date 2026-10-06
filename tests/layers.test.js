import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Cesium from 'cesium';
import { createTrackLayer } from '../src/layers/tracks.js';
import { createBuildingLayer } from '../src/layers/buildings.js';
import { createPhotoreal } from '../src/app/viewer.js';
import { createBasemap } from '../src/app/basemap.js';
import { createEffects } from '../src/app/effects.js';
import { CASES } from '../src/data/cases/index.js';

// The Google tile loader is a plain export of the package, so it is swapped for one the tests can hold back.
vi.mock('cesium', async (original) => ({ ...(await original()), createGooglePhotorealistic3DTileset: vi.fn() }));

/* A viewer with the parts these layers touch, built from Cesium's own classes that need no graphics card. */
function fakeViewer({ height = 2000 } = {}) {
  const scene = {
    preRender: new Cesium.Event(),
    postRender: new Cesium.Event(),
    primitives: new Cesium.PrimitiveCollection(),
    globe: { getHeight: () => 0 },
    canvas: { clientWidth: 800, clientHeight: 600 },
    requestRender() {},
  };
  return {
    scene,
    clock: new Cesium.Clock({ shouldAnimate: false }),
    camera: {
      positionCartographic: { height, longitude: -0.002, latitude: 0.8988 },
      positionWC: new Cesium.Cartesian3(1, 0, 0),
      directionWC: new Cesium.Cartesian3(0, 0, -1),
      pickEllipsoid: () => Cesium.Cartesian3.fromDegrees(-0.12, 51.5),
      moveEnd: new Cesium.Event(),
      changed: new Cesium.Event(),
      percentageChanged: 0.5,
    },
    dataSources: { add() {} },
    creditDisplay: { addStaticCredit() {}, removeStaticCredit() {} },
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    imageryLayers: new Cesium.ImageryLayerCollection(),
    trackedEntity: undefined,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('flight path playback', () => {
  beforeEach(() => {
    // dotImage() and curtainImage() draw to canvases; nothing here looks at the pixels.
    const ctx = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : t[k] ?? (() => {})), set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stops at the end of the track, so the button offers play again and a press replays it', async () => {
    const viewer = fakeViewer();
    const layer = createTrackLayer(viewer);
    const flown = CASES.find((c) => c.tracks?.length);
    expect(layer.load(flown)).toBeTruthy();
    layer.seek(0.5);
    layer.play();
    layer.setSpeed(1e6); // the rest of the track in a few milliseconds
    expect(layer.playing).toBe(true);
    viewer.clock.tick();
    await sleep(25);
    viewer.clock.tick();
    expect(layer.progress()).toBeCloseTo(1, 6);
    expect(layer.playing).toBe(false);
    layer.play(); // from the end: starts again from the beginning
    expect(layer.playing).toBe(true);
    expect(layer.progress()).toBeCloseTo(0, 6);
  });

  it('keeps running when it has not reached the end', () => {
    const viewer = fakeViewer();
    const layer = createTrackLayer(viewer);
    layer.load(CASES.find((c) => c.tracks?.length));
    layer.play();
    viewer.clock.tick();
    expect(layer.playing).toBe(true);
  });
});

describe('3D buildings', () => {
  const TILEJSON = 'https://tiles.example/planet';
  let tileCalls;
  let tilejsonCalls;
  let failTiles;

  beforeEach(() => {
    vi.useFakeTimers();
    tileCalls = 0;
    tilejsonCalls = 0;
    failTiles = false;
    // No tile has a building layer: an empty vector tile.
    vi.stubGlobal('fetch', async (url) => {
      if (String(url).includes('openfreemap.org/planet') && !String(url).endsWith('.pbf')) {
        tilejsonCalls++;
        return { ok: true, json: async () => ({ tiles: [`${TILEJSON}/{z}/{x}/{y}.pbf`] }) };
      }
      tileCalls++;
      if (failTiles) throw new TypeError('network down');
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const settle = () => vi.advanceTimersByTimeAsync(400);

  it('does not leave the status on "loading…" when the last tiles come back with no buildings', async () => {
    const statuses = [];
    const layer = createBuildingLayer(fakeViewer(), { onStatus: (s) => statuses.push(s) });
    layer.show = true;
    await settle();
    expect(tileCalls).toBeGreaterThan(0);
    expect(statuses).toContain('loading…');
    expect(statuses.at(-1)).toBe('0');
  });

  it('looks up the tile address once, however many tiles ask', async () => {
    const layer = createBuildingLayer(fakeViewer());
    layer.show = true;
    await settle();
    expect(tileCalls).toBeGreaterThan(1);
    expect(tilejsonCalls).toBe(1);
  });

  it('asks again for a tile that failed, after a pause and not on every camera move', async () => {
    const layer = createBuildingLayer(fakeViewer());
    failTiles = true;
    layer.show = true;
    await settle();
    const first = tileCalls;
    expect(first).toBeGreaterThan(0);
    failTiles = false;
    layer.refresh(); // the camera moved a moment later: still waiting
    await settle();
    expect(tileCalls).toBe(first);
    await vi.advanceTimersByTimeAsync(21_000);
    layer.refresh();
    await settle();
    expect(tileCalls).toBe(first * 2);
    layer.refresh(); // and those loaded, so they are not asked for again
    await settle();
    expect(tileCalls).toBe(first * 2);
  });
});

describe('photorealistic 3D tiles', () => {
  const tileset = () => ({ destroyed: false, destroy() { this.destroyed = true; } });
  let pending;

  beforeEach(() => {
    pending = [];
    // Each load waits until the test lets it finish.
    Cesium.createGooglePhotorealistic3DTileset.mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject, ts: tileset() })),
    );
  });
  afterEach(() => Cesium.createGooglePhotorealistic3DTileset.mockReset());

  const setup = () => {
    const viewer = fakeViewer();
    const added = [];
    viewer.scene.primitives = { add: (p) => (added.push(p), p), remove: (p) => (added.splice(added.indexOf(p), 1), true) };
    return { photoreal: createPhotoreal(viewer), added };
  };
  const finish = (i) => pending[i].resolve(pending[i].ts);

  it('keeps only the newest of two loads that overlap', async () => {
    const { photoreal, added } = setup();
    const first = photoreal.load({ key: 'a'.repeat(30) });
    const second = photoreal.load({ key: 'b'.repeat(30) });
    finish(1);
    expect(await second).toMatchObject({ ok: true });
    finish(0);
    expect(await first).toMatchObject({ ok: true }); // told what the newest found
    expect(added).toEqual([pending[1].ts]);
    expect(pending[0].ts.destroyed).toBe(true);
    expect(photoreal.active).toBe(true);
  });

  it('is not switched back on by a load that was still running when it was turned off', async () => {
    const { photoreal, added } = setup();
    const load = photoreal.load({ key: 'a'.repeat(30) });
    photoreal.unload();
    finish(0);
    expect((await load).ok).toBe(false);
    expect(added).toEqual([]);
    expect(photoreal.active).toBe(false);
    expect(pending[0].ts.destroyed).toBe(true);
  });
});

describe('map style', () => {
  let store;
  let fail;
  beforeEach(() => {
    store = {};
    fail = new Set();
    vi.stubGlobal('localStorage', { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A map service per URL that can be told to be unreachable (the provider is a real one that is never asked for a tile).
    vi.spyOn(Cesium.ArcGisMapServerImageryProvider, 'fromUrl').mockImplementation(async (url) => {
      if ([...fail].some((f) => url.includes(f))) throw new Error('unreachable');
      return new Cesium.UrlTemplateImageryProvider({ url: `${url}/tile/{z}/{y}/{x}` });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setup() {
    const viewer = fakeViewer();
    viewer.imageryLayers.add(new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({ url: 'https://example.test/{z}/{y}/{x}' })));
    return { viewer, map: createBasemap(viewer) };
  }

  it('does not take a remembered style that is only an inherited object property', () => {
    store['gods-eye-uap:basemap'] = JSON.stringify({ style: 'constructor', names: false });
    expect(setup().map.style).toBe('satellite');
  });

  it('falls back to the map that is on screen when two styles are asked for and neither loads', async () => {
    const { map } = setup();
    fail.add('World_Dark_Gray_Base');
    fail.add('World_Street_Map');
    const dark = map.setStyle('dark');
    const streets = map.setStyle('streets');
    await Promise.all([dark, streets]);
    expect(map.style).toBe('satellite');
    expect(JSON.parse(store['gods-eye-uap:basemap']).style).toBe('satellite');
  });

  it('shows the last style asked for even when an earlier one failed', async () => {
    const { map } = setup();
    fail.add('World_Dark_Gray_Base');
    await Promise.all([map.setStyle('dark'), map.setStyle('streets')]);
    expect(map.style).toBe('streets');
    expect(JSON.parse(store['gods-eye-uap:basemap']).style).toBe('streets');
  });
});

describe('sensor looks', () => {
  it('turns an unknown mode, even one that is a property every object has, into the normal look', () => {
    vi.stubGlobal('document', { body: { dataset: {} } });
    const stages = [];
    const viewer = { scene: { postProcessStages: { add: (s) => (stages.push(s), s) } } };
    const effects = createEffects(viewer);
    for (const mode of ['constructor', 'toString', '__proto__', 'nope', undefined]) {
      expect(effects.set(mode), String(mode)).toBe('normal');
      expect(effects.mode).toBe('normal');
    }
    expect(effects.set('nvg')).toBe('nvg');
    expect(stages.filter((s) => s.enabled)).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
