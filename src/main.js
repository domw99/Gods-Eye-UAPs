import * as Cesium from 'cesium';
import { createViewer, createPhotoreal, saveGoogleKey, storedGoogleKey, hasEnvGoogleKey, hasIonToken } from './app/viewer.js';
import { createEffects, MODE_LABELS } from './app/effects.js';
import { state, subscribe, update, setLayer, inYearRange, YEAR_MIN, YEAR_MAX } from './state.js';
import { CASES } from './data/cases/index.js';
import { CASE_ITEMS, loadOfficial, userToItem } from './data/items.js';
import { createItemLayer } from './layers/items.js';
import { createTrackLayer } from './layers/tracks.js';
import { createPointLayer, townJitter } from './layers/points.js';
import { createSatelliteLayer } from './layers/satellites.js';
import { createBuildingLayer } from './layers/buildings.js';
import { createLaunchLayer } from './layers/launches.js';
import { createAirspaceLayer } from './layers/airspace.js';
import { loadAirspace, areasAt, AIRSPACE_TYPES, formatFt } from './services/airspace.js';
import { launchesAroundNow, RateLimitError } from './services/launches.js';
import { renderLayers, renderFilters, renderList, bindList, markSelected } from './ui/list.js';
import { createTimeline, countByYear } from './ui/timeline.js';
import {
  renderCase, renderOfficial, renderBlueBook, renderNuforc, renderUser, renderSatellite,
  renderSkyCheck, closeDossier, bindDossierActions, showOcr, renderLaunchPad, renderAirspace, renderMufon, showMufonText, renderGeipan,
} from './ui/dossier.js';
import { loadMufon, issueDate, pageNumber } from './services/mufon.js';
import { loadGeipan, classInfo, geipanDate, fold, CLASS_COLORS, GEIPAN_COLOR } from './services/geipan.js';
import { openGovFiles, openAbout, openLogForm, openLightbox, openMapSettings, openExplain, openCompare, closeModal } from './ui/modals.js';
import { skyAt, sunAltitude, nightDim } from './services/sky.js';
import { weatherAt } from './services/weather.js';
import { launchesNear } from './services/launches.js';
import { rankCandidates, confidenceLabel, HEIGHTS, MOTIONS } from './services/explain.js';
import { createStory } from './ui/story.js';
import { toast, esc, html, mount } from './util/dom.js';
import { formatDMS, haversineKm } from './util/geo.js';
import { shapeClasses } from './data/taxonomy.js';

const BASE = import.meta.env.BASE_URL;
const LOG_KEY = 'gods-eye-uap:log';

/* ── Boot ──────────────────────────────────────────────── */
const viewer = await createViewer(document.getElementById('globe'));
const effects = createEffects(viewer);
const itemLayer = createItemLayer(viewer);
const trackLayer = createTrackLayer(viewer);
const bluebookLayer = createPointLayer(viewer, { name: 'bluebook', color: '#ffb547', pixelSize: 5 });
const mufonLayer = createPointLayer(viewer, { name: 'mufon', color: '#b58cff', pixelSize: 4.5 });
const geipanLayer = createPointLayer(viewer, { name: 'geipan', color: GEIPAN_COLOR, pixelSize: 5, alpha: 0.9 });
const nuforcLayer = createPointLayer(viewer, { name: 'nuforc', color: '#ff7a45', pixelSize: 2.5, alpha: 0.55, near: 1.6, far: 0.7 });
const satLayer = createSatelliteLayer(viewer, (msg) => renderLayersNow({ satellites: msg.replace(/ \(CelesTrak, live\)/, '') }));
const buildingLayer = createBuildingLayer(viewer, { onStatus: (s) => renderLayersNow({ buildings: s }) });
const photoreal = createPhotoreal(viewer, { onChange: ({ active }) => buildingLayer.suspend(active) });
const launchLayer = createLaunchLayer(viewer);
const airspaceLayer = createAirspaceLayer(viewer);
const story = createStory({ viewer, trackLayer });

let officialMeta = null;
let officialItems = [];
let officialById = new Map();
let userItems = loadUserLog().map(userToItem);
let bluebook = null; // { meta, records }
let nuforc = null;
let mufon = null; // { issues, records, byIssueId, cases, chapters }
let geipan = null; // { meta, records, byId }
const layerCounts = { cases: CASE_ITEMS.length, official: '…', bluebook: '10k', geipan: '2.8k', mufon: '485 issues', nuforc: '80k', satellites: 'live', launches: 'LL2', airspace: '1.5k', buildings: 'zoom in', user: userItems.length };

try {
  const o = await loadOfficial(BASE);
  officialMeta = o.meta;
  officialItems = o.items;
  officialById = new Map(o.meta.items.map((i) => [i.dvidsId, i]));
  layerCounts.official = officialItems.length;
} catch (e) {
  console.warn(e);
  toast('Official footage catalogue unavailable');
}

const allItems = () => [...CASE_ITEMS, ...officialItems, ...userItems];
itemLayer.setItems(allItems());
buildingLayer.show = state.layers.buildings;
if (photoreal.configured)
  photoreal.load().then((r) => {
    if (!r.ok && storedGoogleKey()) toast('Your Google key did not load 3D tiles — check Map settings');
  });

/* ── Filtering ─────────────────────────────────────────── */
function passesNonYear(it) {
  if (!state.layers[{ case: 'cases', official: 'official', user: 'user' }[it.kind]]) return false;
  if (state.search && !it.search.includes(state.search)) return false;
  if (state.evidence.size && !it.evidence.some((e) => state.evidence.has(e))) return false;
  if (state.shape.size && !it.shapes?.some((s) => state.shape.has(s))) return false;
  if (state.status.size) {
    const s = it.status === 'identified' ? 'identified' : it.status;
    if (!state.status.has(s)) return false;
  }
  return true;
}

/** Blue Book files are official documents with no per-file assessment. */
function bluebookPasses(r) {
  if (state.evidence.size && !state.evidence.has('official-document')) return false;
  if (state.status.size && !state.status.has('unassessed')) return false;
  if (state.shape.size) return false; // file names carry no shape
  if (state.search && !r.place.toLowerCase().includes(state.search) && !r.id.toLowerCase().includes(state.search)) return false;
  return inYearRange(r.year);
}

/** MUFON journal mentions: civilian investigations with no per-report assessment or shape. */
function mufonPasses(r) {
  if (state.evidence.size) return false;
  if (state.status.size && !state.status.has('unassessed')) return false;
  if (state.shape.size) return false;
  if (state.search && !r.place.toLowerCase().includes(state.search) && !r.quote.toLowerCase().includes(state.search)) return false;
  return inYearRange(r.year);
}

/** GEIPAN files: official French documents, filtered by GEIPAN's own classification. */
let foldedSearch = ['', ''];
function geipanPasses(r) {
  if (state.evidence.size && !state.evidence.has('official-document') && !(r.witnesses > 1 && state.evidence.has('multiple-witnesses'))) return false;
  if (state.status.size && !state.status.has(r.status)) return false;
  if (state.shape.size) return false; // the files carry no shape field
  if (state.search) {
    if (foldedSearch[0] !== state.search) foldedSearch = [state.search, fold(state.search)];
    if (!r.search.includes(foldedSearch[1])) return false;
  }
  return inYearRange(r.year);
}

const timeline = createTimeline({ onPlayToggle: toggleHistorySweep });

let nuforcShapeClasses = null;
function refresh() {
  const base = allItems().filter(passesNonYear);
  const visible = base.filter((it) => inYearRange(it.year));
  renderList(visible);
  itemLayer.setVisible(new Set(visible.map((i) => i.key)));
  timeline.setItems(base);
  // Point layers follow the same year/search filters.
  if (bluebook && state.layers.bluebook) {
    const n = bluebookLayer.filter((i) => bluebookPasses(bluebook.records[i]));
    layerCounts.bluebook = n.toLocaleString();
  }
  if (mufon && state.layers.mufon) {
    const n = mufonLayer.filter((i) => mufonPasses(mufon.records[i]));
    layerCounts.mufon = n.toLocaleString();
  }
  if (geipan && state.layers.geipan) {
    const n = geipanLayer.filter((i) => geipanPasses(geipan.records[i]));
    layerCounts.geipan = n.toLocaleString();
  }
  if (nuforc && state.layers.nuforc) {
    const evOk = !state.evidence.size && (!state.status.size || state.status.has('unassessed'));
    nuforcShapeClasses ||= nuforc.shapes.map((s) => shapeClasses(s));
    const shapeOk = (i) => !state.shape.size || nuforcShapeClasses[nuforc.shape[i]].some((s) => state.shape.has(s));
    const n = nuforcLayer.filter((i) => evOk && shapeOk(i) && inYearRange(Math.floor(nuforc.date[i] / 10000)) && (!state.search || nuforc.places[nuforc.place[i]].toLowerCase().includes(state.search) || nuforc.shapes[nuforc.shape[i]] === state.search));
    layerCounts.nuforc = n.toLocaleString();
  }
  layerCounts.user = userItems.length;
  renderLayersNow();
  markSelected(state.selected);
}

function renderLayersNow(extra = {}) {
  Object.assign(layerCounts, extra);
  renderLayers(layerCounts);
}

subscribe((s, reason) => {
  if (reason === 'layers') applyLayers();
  if (['search', 'evidence', 'status', 'shape', 'yearRange', 'sort', 'layers'].includes(reason)) {
    if (reason === 'evidence' || reason === 'status' || reason === 'shape') renderFilters();
    refresh();
  }
});

async function applyLayers() {
  const L = state.layers;
  bluebookLayer.show = L.bluebook;
  mufonLayer.show = L.mufon;
  geipanLayer.show = L.geipan;
  nuforcLayer.show = L.nuforc;
  satLayer.show = L.satellites;
  buildingLayer.show = L.buildings;
  launchLayer.show = L.launches;
  if (L.launches) ensureLaunches();
  airspaceLayer.show = L.airspace;
  if (L.airspace && !airspaceLayer.count) ensureAirspaceLayer();
  if (L.bluebook && !bluebook) await ensureBlueBook();
  if (L.mufon && !mufon) await ensureMufon();
  if (L.geipan && !geipan) await ensureGeipan();
  if (L.nuforc && !nuforc) await ensureNuforc();
  timeline.setBlueBook(L.bluebook && bluebook ? countByYear(bluebook.records.map((r) => r.year)) : null);
  timeline.setMufon(L.mufon && mufon ? countByYear(mufon.records.map((r) => r.year)) : null);
  timeline.setGeipan(L.geipan && geipan ? countByYear(geipan.records.map((r) => r.year)) : null);
  timeline.setNuforc(L.nuforc && nuforc ? countByYear(Array.from(nuforc.date, (d) => Math.floor(d / 10000))) : null);
  refresh();
}

/* ── Lazy data layers ──────────────────────────────────── */
async function ensureAirspaceLayer() {
  renderLayersNow({ airspace: 'loading…' });
  try {
    const { areas } = await loadAirspace(BASE);
    airspaceLayer.setAreas(areas);
    renderLayersNow({ airspace: areas.length.toLocaleString() });
  } catch (error) {
    console.warn(error);
    renderLayersNow({ airspace: 'offline' });
  }
}

/** Which military areas contain the case location or any track point (at its altitude)? */
async function airspaceFor(c) {
  const { areas } = await loadAirspace(BASE);
  const hits = new Map();
  for (const a of areasAt(areas, c.lon, c.lat)) hits.set(a.index, { area: a, why: 'location' });
  for (const t of c.tracks || [])
    for (const [lon, lat, altM] of t.points)
      for (const a of areasAt(areas, lon, lat, altM / 0.3048))
        if (!hits.has(a.index)) hits.set(a.index, { area: a, why: t.label });
  return [...hits.values()];
}

let launchesLoaded = 0;
async function ensureLaunches() {
  if (Date.now() - launchesLoaded < 30 * 60e3) return;
  launchesLoaded = Date.now();
  renderLayersNow({ launches: 'loading…' });
  try {
    launchLayer.setLaunches(await launchesAroundNow(14, 30));
    renderLayersNow({ launches: launchLayer.count });
  } catch (error) {
    launchesLoaded = Date.now() - 25 * 60e3; // retry in about five minutes, not on every toggle
    console.warn(error);
    renderLayersNow({ launches: 'offline' });
    toast(error instanceof RateLimitError ? 'Launch Library limit reached (about 15 look-ups an hour). Try again later.' : 'Launch Library unavailable');
  }
}

let bluebookPromise = null;
function ensureBlueBook() {
  bluebookPromise ||= (async () => {
    renderLayersNow({ bluebook: 'loading…' });
    const res = await fetch(`${BASE}data/bluebook.json`);
    const data = await res.json();
    const records = data.records.map(([id, lat, lon, prec, place]) => {
      const m = id.match(/^(\d{4})-(\d{1,2})?/);
      const naid = id.split('-')[2];
      return { id, lat, lon, prec, place, year: +m[1], month: m[2] ? +m[2] : null, naid };
    });
    bluebook = { meta: data, records, byId: new Map(records.map((r) => [r.id, r])) };
    bluebookLayer.setData(records, {
      lat: (r) => r.lat,
      lon: (r) => r.lon,
      year: (r) => r.year,
      jitter: (r, i, la, lo) => (r.prec === 3 ? [la, lo] : townJitter(r.id, la, lo, r.prec === 1 ? 25 : 2.5)),
    });
    layerCounts.bluebook = records.filter((r) => r.lat != null).length.toLocaleString();
    return bluebook;
  })().catch((e) => {
    bluebookPromise = null;
    toast('Could not load Blue Book layer');
    throw e;
  });
  return bluebookPromise;
}

let mufonPromise = null;
function ensureMufon() {
  mufonPromise ||= (async () => {
    renderLayersNow({ mufon: 'loading…' });
    mufon = await loadMufon(BASE);
    mufonLayer.setData(mufon.records, {
      lat: (r) => r.lat,
      lon: (r) => r.lon,
      year: (r) => r.year,
      jitter: (r, i, la, lo) => townJitter(`m${i}`, la, lo, 2.5),
    });
    layerCounts.mufon = mufon.records.length.toLocaleString();
    return mufon;
  })().catch((e) => {
    mufonPromise = null;
    toast('Could not load the MUFON files');
    throw e;
  });
  return mufonPromise;
}

let geipanPromise = null;
function ensureGeipan() {
  geipanPromise ||= (async () => {
    renderLayersNow({ geipan: 'loading…' });
    geipan = await loadGeipan(BASE);
    geipanLayer.setData(geipan.records, {
      lat: (r) => r.lat,
      lon: (r) => r.lon,
      year: (r) => r.year,
      color: (r) => CLASS_COLORS[r.cls] || GEIPAN_COLOR,
      // Many cases share a commune; department-level cases spread wider.
      jitter: (r, i, la, lo) => townJitter(`g${r.id}`, la, lo, r.prec === 1 ? 20 : 2),
    });
    layerCounts.geipan = geipan.records.filter((r) => r.lat != null).length.toLocaleString();
    return geipan;
  })().catch((e) => {
    geipanPromise = null;
    toast('Could not load the GEIPAN files');
    throw e;
  });
  return geipanPromise;
}

/** GEIPAN files within 40 km and three days of a curated French case. */
async function geipanFor(c) {
  const g = await ensureGeipan();
  const t = Date.parse(c.date);
  const out = [];
  for (const r of g.records) {
    if (r.lat == null || !r.month || !r.day) continue;
    const rt = r.utc ? Date.parse(r.utc) : Date.UTC(r.year, r.month - 1, r.day, 12);
    if (Math.abs(rt - t) > 3 * 86400e3) continue;
    const distKm = haversineKm(c.lat, c.lon, r.lat, r.lon);
    if (distKm <= 40) out.push({ ...r, distKm });
  }
  return out.sort((a, b) => a.distKm - b.distKm).slice(0, 8);
}

/** Journal pages about a curated case, plus reports from nearby places in the years after it. */
async function mufonFor(c) {
  const m = await ensureMufon();
  const found = m.cases[c.id];
  const hits = (found?.hits || []).map(([ii, leaf, quote]) => ({ is: m.issues[ii], leaf, quote }));
  const seen = new Set(hits.map((h) => `${h.is.id}/${h.leaf}`));
  const year = new Date(c.date).getUTCFullYear();
  const near = [];
  if (c.precision !== 'region')
    for (const r of m.records) {
      if (r.year < year || r.year > year + 3) continue;
      const d = haversineKm(c.lat, c.lon, r.lat, r.lon);
      const is = m.issues[r.issue];
      if (d <= 40 && !seen.has(`${is.id}/${r.leaf}`)) near.push({ is, leaf: r.leaf, place: r.place, quote: r.quote, distKm: d });
    }
  near.sort((a, b) => a.is.index - b.is.index);
  return { term: found?.term, total: found?.total || 0, hits, near: near.slice(0, 6), issues: m.issues.length };
}

let nuforcPromise = null;
function ensureNuforc() {
  nuforcPromise ||= (async () => {
    renderLayersNow({ nuforc: 'loading…' });
    const res = await fetch(`${BASE}data/nuforc.json`);
    nuforc = await res.json();
    nuforcLayer.setData(nuforc.lat, {
      lat: (_, i) => nuforc.lat[i],
      lon: (_, i) => nuforc.lon[i],
      year: (_, i) => Math.floor(nuforc.date[i] / 10000),
      jitter: (_, i, la, lo) => townJitter(String(i), la, lo, 4),
    });
    return nuforc;
  })().catch((e) => {
    nuforcPromise = null;
    toast('Could not load civilian reports');
    throw e;
  });
  return nuforcPromise;
}

async function bluebookNear(c, radiusKm) {
  const bb = await ensureBlueBook();
  const d = new Date(c.date);
  const ym = d.getUTCFullYear() * 12 + d.getUTCMonth();
  const linked = new Set(c.bluebook || []);
  const out = [];
  for (const r of bb.records) {
    if (linked.has(r.id)) {
      out.push({ ...r, distKm: r.lat != null ? haversineKm(c.lat, c.lon, r.lat, r.lon) : null, linked: true });
      continue;
    }
    if (r.lat == null || !r.month || r.prec < 2) continue;
    if (Math.abs(r.year * 12 + (r.month - 1) - ym) > 1) continue;
    const dist = haversineKm(c.lat, c.lon, r.lat, r.lon);
    if (dist <= radiusKm) out.push({ ...r, distKm: dist });
  }
  return out.sort((a, b) => (b.linked ? 1 : 0) - (a.linked ? 1 : 0) || a.distKm - b.distKm).slice(0, 20);
}

/* ── Day and night at the moment of a case ─────────────── */
// With a case open, the globe is lit by the sun at that moment: the day/night
// line shows from high up, and close up the ground dims to dusk or night.
let sceneMoment = null; // { lat, lon, approx } while a record's time drives the lighting

function setSceneMoment(rec) {
  const globe = viewer.scene.globe;
  const imagery = viewer.imageryLayers.get(0);
  if (!rec || rec.lat == null || !rec.date) {
    sceneMoment = null;
    globe.enableLighting = false;
    if (imagery) imagery.brightness = 1;
    if (!trackLayer.current) viewer.clock.currentTime = Cesium.JulianDate.now();
    return;
  }
  sceneMoment = { lat: rec.lat, lon: rec.lon, approx: Boolean(rec.approx), dim: 1 };
  globe.enableLighting = true;
  // From high up, Cesium shades the night side (the terminator shows from
  // 1,500 km). Closer in, the ground is dimmed gently instead, so a night
  // case still reads; the two hand over between 1,500 and 4,000 km.
  // Cesium measures these fade distances from the Earth's centre.
  globe.lightingFadeOutDistance = EARTH_RADIUS + LIGHT_NEAR;
  globe.lightingFadeInDistance = EARTH_RADIUS + LIGHT_FAR;
  if (!trackLayer.current) viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(rec.date));
  updateNightDim();
}
const LIGHT_NEAR = 1.5e6; // camera heights above the ground
const LIGHT_FAR = 4e6;
const EARTH_RADIUS = 6_371_000;

/** Recompute the sun at the site for the current clock time. */
function updateNightDim() {
  if (!sceneMoment) return;
  try {
    const when = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    sceneMoment.dim = nightDim(sunAltitude(sceneMoment.lat, sceneMoment.lon, when));
  } catch {
    sceneMoment.dim = 1;
  }
}
viewer.scene.preRender.addEventListener(() => {
  const imagery = viewer.imageryLayers.get(0);
  if (!sceneMoment || !imagery) return;
  const h = viewer.camera.positionCartographic.height;
  const t = Math.min(1, Math.max(0, (h - LIGHT_NEAR) / (LIGHT_FAR - LIGHT_NEAR)));
  imagery.brightness = sceneMoment.dim + (1 - sceneMoment.dim) * t;
});
let lastDim = 0;
trackLayer.onTick(() => {
  if (performance.now() - lastDim < 400) return;
  lastDim = performance.now();
  updateNightDim();
});

/* ── Selection & camera ────────────────────────────────── */
const itemByKey = (key) => allItems().find((i) => i.key === key);

function flyToItem(item, { tracks } = {}) {
  if (tracks) return trackLayer.fit(2.2);
  const pos = itemLayer.positionOf(item.key) || (item.lat != null ? { lat: item.lat, lon: item.lon } : null);
  if (!pos) return;
  const range = item.radiusKm
    ? Math.max(800e3, item.radiusKm * 3500)
    : { site: 14e3, city: 45e3, area: 260e3, region: 1500e3 }[item.precision] || 60e3;
  viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat), 10),
    { duration: 2.2, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(item.radiusKm ? -80 : -50), range) },
  );
}

// Blue Book and MUFON selections wait for their data; a newer selection wins.
let selectToken = 0;

function select(key, source = 'api') {
  const item = itemByKey(key);
  if (!item) return false;
  selectToken++;
  hideHover();
  if (source !== 'tour') stopTour();
  story.stop(true);
  state.selected = key;
  markSelected(key);
  itemLayer.setSelected(key);
  itemLayer.showRegion(item.kind === 'official' ? item : null);
  trackLayer.clear();
  hidePlayback();
  if (item.kind === 'case') {
    renderCase(item, { officialById, bluebookNear, airspaceFor, mufonFor, geipanFor });
    const loaded = trackLayer.load(item.ref);
    if (loaded) showPlayback();
    setSceneMoment({ lat: item.ref.lat, lon: item.ref.lon, date: item.ref.date, approx: item.ref.timeApprox });
    flyToItem(item, { tracks: !!loaded });
  } else if (item.kind === 'official') {
    renderOfficial(item, { officialById });
    setSceneMoment(null);
    flyToItem(item);
  } else if (item.kind === 'user') {
    renderUser(item, { onDelete: deleteUser });
    setSceneMoment({ lat: item.ref.lat, lon: item.ref.lon, date: item.ref.date });
    flyToItem(item);
  }
  setHash(`#/${item.kind}/${encodeURIComponent(item.id)}`);
  document.getElementById('hud-tgt').textContent = item.title.slice(0, 40).toUpperCase();
  return true;
}

async function selectBlueBook(id) {
  stopTour();
  story.stop(true);
  const token = ++selectToken;
  hideHover();
  const bb = await ensureBlueBook();
  if (token !== selectToken) return;
  const rec = bb.byId.get(id);
  if (!rec) return toast('Blue Book file not found');
  if (!state.layers.bluebook) setLayer('bluebook', true);
  state.selected = null;
  markSelected(null);
  itemLayer.setSelected(null);
  trackLayer.clear();
  setSceneMoment(null);
  hidePlayback();
  itemLayer.showRegion(null);
  renderBlueBook(rec);
  if (rec.lat != null)
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat), 10), {
      duration: 2,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), rec.prec === 1 ? 900e3 : 60e3),
    });
  setHash(`#/bluebook/${encodeURIComponent(id)}`);
  document.getElementById('hud-tgt').textContent = `BLUE BOOK ${rec.place}`.slice(0, 40).toUpperCase();
}

async function selectGeipan(id) {
  stopTour();
  story.stop(true);
  const token = ++selectToken;
  hideHover();
  const g = await ensureGeipan();
  if (token !== selectToken) return;
  const rec = g.byId.get(id);
  if (!rec) return toast('GEIPAN file not found');
  if (!state.layers.geipan) setLayer('geipan', true);
  state.selected = null;
  markSelected(null);
  itemLayer.setSelected(null);
  trackLayer.clear();
  hidePlayback();
  itemLayer.showRegion(null);
  // With an observation time, light the globe for that moment as for a case.
  setSceneMoment(rec.utc && rec.lat != null ? { lat: rec.lat, lon: rec.lon, date: rec.utc } : null);
  renderGeipan(rec);
  if (rec.lat != null)
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(rec.lon, rec.lat), 10), {
      duration: 2,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), rec.prec === 1 ? 400e3 : 45e3),
    });
  setHash(`#/geipan/${encodeURIComponent(id)}`);
  document.getElementById('hud-tgt').textContent = `GEIPAN ${rec.place}`.slice(0, 40).toUpperCase();
}

async function selectMufonPage(issueId, leaf, recordIndex = null) {
  stopTour();
  story.stop(true);
  const token = ++selectToken;
  hideHover();
  const m = await ensureMufon();
  if (token !== selectToken) return;
  const is = m.byIssueId.get(issueId);
  if (!is || !(leaf >= 0 && leaf < is.pages)) return toast('That MUFON Journal page was not found');
  const inIssue = m.records.filter((r) => r.issue === is.index).sort((a, b) => a.leaf - b.leaf);
  const onPage = inIssue.filter((r) => r.leaf === leaf);
  const record = recordIndex != null && m.records[recordIndex]?.issue === is.index ? m.records[recordIndex] : onPage[0] || null;
  if (record && !state.layers.mufon) setLayer('mufon', true);
  state.selected = null;
  markSelected(null);
  itemLayer.setSelected(null);
  trackLayer.clear();
  setSceneMoment(null);
  hidePlayback();
  itemLayer.showRegion(null);
  renderMufon({ is, leaf, record, onPage, inIssue });
  if (record)
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(record.lon, record.lat), 10), {
      duration: 2,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), 60e3),
    });
  setHash(`#/mufon/${encodeURIComponent(is.id)}/${leaf}`);
  document.getElementById('hud-tgt').textContent = `MUFON ${record ? record.place : issueDate(is)}`.slice(0, 40).toUpperCase();
}

function deselect() {
  selectToken++;
  hideHover();
  story.stop(true);
  state.selected = null;
  markSelected(null);
  itemLayer.setSelected(null);
  closeDossier();
  trackLayer.clear();
  setSceneMoment(null);
  hidePlayback();
  itemLayer.showRegion(null);
  setHash('');
  document.getElementById('hud-tgt').textContent = 'NONE';
}

let suppressHash = false;
function setHash(h) {
  suppressHash = true;
  const url = `${location.pathname}${location.search}${h}`;
  history.replaceState(null, '', url);
  setTimeout(() => (suppressHash = false), 0);
}

function routeFromHash() {
  const mj = location.hash.match(/^#\/mufon\/([^/]+)\/(\d+)$/);
  if (mj) {
    selectMufonPage(decodeURIComponent(mj[1]), +mj[2]);
    return true;
  }
  const m = location.hash.match(/^#\/(case|official|user|bluebook|geipan)\/(.+)$/);
  if (!m) return false;
  const [, kind, raw] = m;
  const id = decodeURIComponent(raw);
  if (kind === 'bluebook') selectBlueBook(id);
  else if (kind === 'geipan') selectGeipan(id);
  else if (!select(`${kind}:${id}`, 'hash')) {
    toast(kind === 'user' ? 'That sighting is not in this browser’s log' : `Nothing found for “${id}”`);
    return false;
  }
  return true;
}
window.addEventListener('hashchange', () => {
  if (!suppressHash) routeFromHash();
});

/* ── Globe picking & hover ─────────────────────────────── */
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
const hoverEl = document.createElement('div');
hoverEl.className = 'hover-label hidden';
document.body.appendChild(hoverEl);

function describePick(picked) {
  if (!picked) return null;
  const id = picked.id;
  if (id instanceof Cesium.Entity && id.__item) return { type: 'item', item: id.__item };
  if (id && typeof id === 'object' && id.layer) return { type: id.layer, index: id.index };
  return null;
}

function hideHover() {
  hoverEl.classList.add('hidden');
  viewer.scene.canvas.style.cursor = '';
}
// Touch has no hover, and a tap would otherwise leave the label stuck on screen.
let pointerIsTouch = false;
viewer.scene.canvas.addEventListener('pointerdown', (e) => (pointerIsTouch = e.pointerType !== 'mouse'), true);
viewer.scene.canvas.addEventListener('pointermove', (e) => (pointerIsTouch = e.pointerType !== 'mouse'), true);
viewer.scene.canvas.addEventListener('wheel', hideHover, { passive: true });
// When the camera moves under a still pointer, the label would describe the wrong spot.
let cameraMoving = false;
viewer.camera.moveStart.addEventListener(() => {
  cameraMoving = true;
  hideHover();
});
viewer.camera.moveEnd.addEventListener(() => (cameraMoving = false));

handler.setInputAction((click) => {
  stopTour();
  hideHover();
  const hit = describePick(viewer.scene.pick(click.position));
  if (!hit) return;
  if (hit.type === 'item') select(hit.item.key, 'globe');
  else if (hit.type === 'cluster') itemLayer.zoomToCluster(hit.index);
  else if (hit.type === 'bluebook') selectBlueBook(bluebook.records[hit.index].id);
  else if (hit.type === 'geipan') selectGeipan(geipan.records[hit.index].id);
  else if (hit.type === 'mufon') {
    const r = mufon.records[hit.index];
    selectMufonPage(mufon.issues[r.issue].id, r.leaf, r.index);
  }
  else if (hit.type === 'nuforc') {
    const i = hit.index;
    const d = String(nuforc.date[i]);
    deselect();
    renderNuforc({
      place: nuforc.places[nuforc.place[i]],
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      lat: nuforc.lat[i],
      lon: nuforc.lon[i],
      shape: nuforc.shapes[nuforc.shape[i]],
      dur: nuforc.dur[i],
    });
  } else if (hit.type === 'satellite') {
    const info = satLayer.info(hit.index);
    if (info) {
      deselect();
      renderSatellite(info);
    }
  } else if (hit.type === 'airspace') {
    const a = airspaceLayer.info(hit.index);
    if (a) {
      deselect();
      renderAirspace(a);
    }
  } else if (hit.type === 'launch') {
    const pad = launchLayer.info(hit.index);
    if (pad) {
      deselect();
      renderLaunchPad(pad);
    }
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

let hoverPending = false;
handler.setInputAction((move) => {
  if (hoverPending) return;
  if (pointerIsTouch || cameraMoving) return hideHover();
  hoverPending = true;
  requestAnimationFrame(() => {
    hoverPending = false;
    const hit = describePick(viewer.scene.pick(move.endPosition));
    let lines = null; // [title, detail] — escaped below, data is external
    if (hit?.type === 'item') lines = [hit.item.title, `${hit.item.year} · ${hit.item.place}`];
    else if (hit?.type === 'cluster') {
      const c = itemLayer.cluster(hit.index);
      if (c) {
        const official = c.members.filter((m) => m.kind === 'official').length;
        const parts = [c.members.length - official && `${c.members.length - official} case files`, official && `${official} official releases`].filter(Boolean);
        lines = [`${c.members.length} records here · click to zoom in`, `${parts.join(' · ')} — ${c.members.slice(0, 2).map((m) => m.title.slice(0, 28)).join('; ')}${c.members.length > 2 ? '…' : ''}`];
      }
    }
    else if (hit?.type === 'bluebook') {
      const r = bluebook.records[hit.index];
      lines = [`Blue Book · ${r.place}`, `${r.year}${r.month ? `-${String(r.month).padStart(2, '0')}` : ''} · USAF case file`];
    } else if (hit?.type === 'geipan') {
      const r = geipan.records[hit.index];
      lines = [`GEIPAN · ${r.place}`, `${geipanDate(r)} · class ${r.cls} — ${classInfo(r.cls).label.replace(/^\w+ · /, '').toLowerCase()}`];
    } else if (hit?.type === 'mufon') {
      const r = mufon.records[hit.index];
      const is = mufon.issues[r.issue];
      lines = [`MUFON · ${r.place}`, `${issueDate(is)} · journal p. ${pageNumber(is, r.leaf)}`];
    } else if (hit?.type === 'nuforc')
      lines = [nuforc.places[nuforc.place[hit.index]], `${String(nuforc.date[hit.index]).slice(0, 4)} · ${nuforc.shapes[nuforc.shape[hit.index]]}`];
    else if (hit?.type === 'satellite') lines = [satLayer.info(hit.index)?.name || 'Satellite', 'live position'];
    else if (hit?.type === 'airspace') {
      const a = airspaceLayer.info(hit.index);
      if (a) lines = [a.name, `${AIRSPACE_TYPES[a.type]?.label || a.type} · ${formatFt(a.lowerFt)} to ${formatFt(a.upperFt)}`];
    } else if (hit?.type === 'launch') {
      const p = launchLayer.info(hit.index);
      const l = p?.next || p?.last;
      if (p) lines = [p.location || p.pad, l ? `${p.next ? 'Next' : 'Last'}: ${l.name}` : `${p.launches.length} launches`];
    }
    if (lines) {
      hoverEl.innerHTML = `${esc(lines[0])}<br><span class="dim">${esc(lines[1])}</span>`;
      hoverEl.style.left = `${move.endPosition.x}px`;
      hoverEl.style.top = `${move.endPosition.y}px`;
      hoverEl.classList.remove('hidden');
      viewer.scene.canvas.style.cursor = 'pointer';
    } else hideHover();
  });
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
viewer.scene.canvas.addEventListener('pointerdown', () => stopTour());
viewer.scene.canvas.addEventListener('pointerleave', hideHover);

/* ── Playback bar ──────────────────────────────────────── */
const pb = {
  bar: document.getElementById('playback'),
  play: document.getElementById('pb-play'),
  scrub: document.getElementById('pb-scrub'),
  time: document.getElementById('pb-time'),
  speed: document.getElementById('pb-speed'),
  follow: document.getElementById('pb-follow'),
  pov: document.getElementById('pb-pov'),
};
function showPlayback() {
  pb.bar.classList.remove('hidden');
  pb.follow.setAttribute('aria-pressed', 'false');
  pb.pov.setAttribute('aria-pressed', 'false');
  const who = trackLayer.witnessLabel;
  pb.pov.classList.toggle('hidden', !who);
  pb.pov.title = who ? `See it from: ${who} (V)` : '';
  pb.speed.value = '1';
  updatePlaybackUi();
}
function hidePlayback() {
  pb.bar.classList.add('hidden');
  if (trackLayer.witnessOn) trackLayer.witnessView(false);
  document.body.classList.remove('pov');
}
function updatePlaybackUi() {
  const cur = trackLayer.current;
  if (!cur) return;
  pb.play.textContent = trackLayer.playing ? '❚❚' : '▶';
  pb.scrub.value = String(Math.round(trackLayer.progress() * 1000));
  const t = Cesium.JulianDate.toDate(viewer.clock.currentTime);
  pb.time.textContent = `${t.toISOString().slice(0, 16).replace('T', ' ')}Z`;
}
trackLayer.onTick(() => updatePlaybackUi());
pb.play.addEventListener('click', () => {
  trackLayer.playing ? trackLayer.pause() : trackLayer.play();
  updatePlaybackUi();
});
document.getElementById('pb-restart').addEventListener('click', () => trackLayer.restart());
pb.scrub.addEventListener('input', () => {
  trackLayer.seek(Number(pb.scrub.value) / 1000);
  updatePlaybackUi();
});
pb.speed.addEventListener('change', () => trackLayer.setSpeed(Number(pb.speed.value)));
pb.follow.addEventListener('click', () => {
  const on = pb.follow.getAttribute('aria-pressed') !== 'true';
  pb.follow.setAttribute('aria-pressed', String(on));
  pb.pov.setAttribute('aria-pressed', 'false');
  document.body.classList.remove('pov');
  trackLayer.follow(on);
  if (on && !trackLayer.playing) trackLayer.play();
});
function toggleWitnessView(force) {
  const on = force ?? pb.pov.getAttribute('aria-pressed') !== 'true';
  const who = trackLayer.witnessView(on);
  pb.pov.setAttribute('aria-pressed', String(Boolean(on && who)));
  if (on && who) {
    pb.follow.setAttribute('aria-pressed', 'false');
    document.body.classList.add('pov');
    toast(`Witness view: ${who}. Press V or Esc to leave.`, 3500);
    if (!trackLayer.playing) trackLayer.play();
  } else {
    document.body.classList.remove('pov');
  }
}
pb.pov.addEventListener('click', () => toggleWitnessView());
document.getElementById('pb-close').addEventListener('click', () => {
  trackLayer.pause();
  toggleWitnessView(false);
  trackLayer.follow(false);
  hidePlayback();
});

/* ── Dossier actions ───────────────────────────────────── */
bindDossierActions({
  lightbox: (d) => openLightbox(d),
  play: () => {
    trackLayer.fit(1.2);
    trackLayer.restart();
    updatePlaybackUi();
  },
  chase: () => pb.follow.click(),
  fit: () => trackLayer.fit(1.5),
  ground: () => {
    const item = itemByKey(state.selected);
    if (!item || item.lat == null) return;
    if (!state.layers.buildings && !photoreal.active) setLayer('buildings', true);
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(item.lon, item.lat), 10), {
      duration: 2.5,
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(20), Cesium.Math.toRadians(-12), 2500),
    });
  },
  ocr: (btn) => showOcr(btn.dataset.id),
  'mufon-text': (btn) => mufon && showMufonText(mufon.byIssueId.get(btn.dataset.issue), +btn.dataset.leaf),
  skycheck: () => {
    const item = itemByKey(state.selected);
    if (!item) return;
    if (!state.layers.satellites) setLayer('satellites', true);
    renderSkyCheck('loading');
    satLayer.ensureLoaded().then(() => renderSkyCheck(satLayer.count ? satLayer.overhead(item.lat, item.lon) : null));
  },
  'export-user': exportUserLog,
  compare: () => {
    const item = itemByKey(state.selected);
    if (item?.kind === 'case') openCompare({ a: item.ref, cases: CASES, onOpen: (id) => select(`case:${id}`, 'compare') });
  },
  story: () => {
    const item = itemByKey(state.selected);
    if (item?.kind === 'case') {
      stopTour();
      toggleWitnessView(false);
      pb.follow.setAttribute('aria-pressed', 'false');
      trackLayer.follow(false);
      story.start(item.ref);
    }
  },
  'explain-user': () => {
    const item = itemByKey(state.selected);
    if (item?.ref) openExplainNow({ date: item.ref.date, lat: item.ref.lat, lon: item.ref.lon });
  },
});
document.getElementById('dossier-close').addEventListener('click', deselect);
document.getElementById('dossier-peek').addEventListener('click', () => {
  const d = document.getElementById('dossier');
  d.classList.toggle('peek');
  document.body.classList.toggle('dossier-peek', d.classList.contains('peek'));
});

// The top bar wraps on small screens; keep panels and HUD clear of it.
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--top-h', `${Math.ceil(entry.target.getBoundingClientRect().height)}px`);
}).observe(document.querySelector('.topbar'));

/* ── User sighting log ─────────────────────────────────── */
function loadUserLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]').filter((u) => Number.isFinite(u.lat) && Number.isFinite(u.lon));
  } catch {
    return [];
  }
}
function saveUserLog(list) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch {
    toast('Could not save — browser storage is unavailable');
  }
}
function addUser(entry) {
  const list = [...userItems.map((u) => u.ref), entry];
  saveUserLog(list);
  userItems = list.map(userToItem);
  itemLayer.setItems(allItems());
  if (!state.layers.user) setLayer('user', true);
  refresh();
  select(`user:${entry.id}`);
  toast('Sighting saved in this browser');
}
function deleteUser(id) {
  const list = userItems.map((u) => u.ref).filter((u) => u.id !== id);
  saveUserLog(list);
  userItems = list.map(userToItem);
  itemLayer.setItems(allItems());
  deselect();
  refresh();
}
function exportUserLog() {
  const fc = {
    type: 'FeatureCollection',
    features: userItems.map(({ ref: u }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [u.lon, u.lat] },
      properties: { ...u },
    })),
  };
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'my-uap-sightings.geojson' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function viewCenter() {
  const c = viewer.camera.pickEllipsoid(
    new Cesium.Cartesian2(viewer.scene.canvas.clientWidth / 2, viewer.scene.canvas.clientHeight / 2),
  );
  // Looking past the globe's edge: use the point under the camera instead of 0°, 0°.
  const carto = c ? Cesium.Cartographic.fromCartesian(c) : viewer.camera.positionCartographic;
  return { lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude) };
}
const openLog = () => openLogForm({ ...viewCenter(), onSave: addUser });

/* ── "What did I see?" checker ─────────────────────────── */
async function explainSighting({ date, lat, lon, report }) {
  const when = new Date(date);
  const checked = ['sky (planets, bright stars, Moon)'];
  const notes = [];
  const sky = skyAt(lat, lon, when, { minAlt: 0 });
  const recent = Math.abs(Date.now() - when.getTime()) < 21 * 86400e3;
  const [satellites, launches, weather] = await Promise.all([
    recent
      ? satLayer
          .ensureLoaded()
          .then(() => (satLayer.count ? satLayer.visibleAt(lat, lon, when, 10) : null))
          .catch(() => null)
      : Promise.resolve(null),
    when.getUTCFullYear() >= 1957
      ? launchesNear(when, 12)
          .then((list) =>
            list.map((l) => ({
              ...l,
              gapMin: (Date.parse(l.net) - when.getTime()) / 60000,
              km: l.lat != null ? haversineKm(lat, lon, l.lat, l.lon) : null,
            })),
          )
          .catch((e) => {
            notes.push(e instanceof RateLimitError ? 'Launch Library limit reached, so launches were skipped.' : 'Launch Library was unreachable.');
            return null;
          })
      : Promise.resolve(null),
    weatherAt(lat, lon, when).catch(() => null),
  ]);
  if (satellites) checked.push(`${satellites.length.toLocaleString()} satellites above the horizon`);
  else if (!recent) notes.push('Satellites were skipped: current orbital data only covers the last three weeks.');
  if (launches) checked.push('rocket launches ±12 h');
  if (weather) checked.push('wind and cloud');
  checked.push('aircraft: not checkable');
  return { candidates: rankCandidates({ report, sky, satellites, launches, weather }), checked, notes };
}

function openExplainNow(prefill) {
  const at = prefill?.lat != null ? { lat: prefill.lat, lon: prefill.lon } : viewCenter();
  openExplain({
    ...at,
    prefill,
    heights: HEIGHTS,
    motions: MOTIONS,
    label: confidenceLabel,
    run: explainSighting,
    onLog: (input, best) =>
      openLogForm({
        lat: input.lat,
        lon: input.lon,
        onSave: addUser,
        prefill: {
          date: input.date,
          description: best ? `Checker's top match: ${best.name} (${confidenceLabel(best.score).toLowerCase()}). ${best.reason}` : '',
        },
      }),
  });
}

/* ── Sensor modes ──────────────────────────────────────── */
function setMode(mode) {
  const m = effects.set(mode);
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-checked', String(b.dataset.mode === m));
  document.getElementById('hud-mode').textContent = MODE_LABELS[m];
  const url = new URL(location.href);
  m === 'normal' ? url.searchParams.delete('mode') : url.searchParams.set('mode', m);
  history.replaceState(null, '', url);
}
document.querySelector('.modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (b) setMode(b.dataset.mode);
});

/* ── History sweep (timeline ▶) ────────────────────────── */
let sweepTimer = null;
function toggleHistorySweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
    timeline.setPlaying(false);
    return;
  }
  let y = 1940;
  timeline.setPlaying(true);
  sweepTimer = setInterval(() => {
    if (y > YEAR_MAX) {
      clearInterval(sweepTimer);
      sweepTimer = null;
      timeline.setPlaying(false);
      update({ yearRange: null }, 'yearRange');
      return;
    }
    update({ yearRange: [Math.max(YEAR_MIN, y), Math.min(YEAR_MAX, y + 4)] }, 'yearRange');
    y += 1;
  }, 450);
}

// Brushing the histogram by hand takes over from the automatic sweep.
document.getElementById('tl-canvas').addEventListener('pointerdown', () => {
  if (sweepTimer) toggleHistorySweep();
});

/* ── Guided tour ───────────────────────────────────────── */
const TOUR = [
  'kenneth-arnold-1947', 'washington-dc-1952', 'kinross-moncla-1953', 'rb-47-1957', 'hill-abduction-1961',
  'portage-county-1966', 'minot-afb-1968', 'tehran-1976', 'rendlesham-1980', 'jal-1628-1986', 'belgian-wave-1990',
  'phoenix-lights-1997', 'nimitz-tic-tac-2004',
  'aguadilla-2013', 'gimbal-gofast-2015', 'north-american-shootdowns-2023',
].filter((id) => CASES.some((c) => c.id === id));
let tourTimer = null;
let tourPlayTimer = null;
let tourIndex = 0;
function tourStep() {
  const id = TOUR[tourIndex % TOUR.length];
  select(`case:${id}`, 'tour');
  clearTimeout(tourPlayTimer);
  tourPlayTimer = setTimeout(() => {
    if (tourTimer && trackLayer.current) trackLayer.play();
  }, 2600);
  toast(`TOUR ${tourIndex + 1}/${TOUR.length} — ${CASES.find((c) => c.id === id).title}`, 3500);
  tourIndex++;
  if (tourIndex >= TOUR.length) {
    tourTimer = setTimeout(stopTour, 18000);
    return;
  }
  tourTimer = setTimeout(tourStep, 18000);
}
function startTour() {
  if (tourTimer) return stopTour();
  tourIndex = 0;
  tourTimer = true;
  document.getElementById('btn-tour').textContent = '■ STOP';
  tourStep();
}
function stopTour() {
  if (!tourTimer) return;
  clearTimeout(tourTimer);
  clearTimeout(tourPlayTimer);
  tourTimer = null;
  document.getElementById('btn-tour').textContent = '▶ TOUR';
}

/* ── Map view: zoom about the screen centre, reset ─────── */
// Wheel and pinch zoom head for the point under the pointer, so the globe
// drifts off centre; these controls zoom along the view axis and reset.
const HOME_VIEW = { lon: -45, lat: 28, height: 17_500_000 };

function flyHome(duration = 1.8) {
  hideHover();
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(HOME_VIEW.lon, HOME_VIEW.lat, HOME_VIEW.height),
    orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
    duration,
  });
}

function resetView() {
  stopTour();
  if (story.active) story.stop(true);
  if (trackLayer.witnessOn) toggleWitnessView(false);
  if (pb.follow.getAttribute('aria-pressed') === 'true') {
    pb.follow.setAttribute('aria-pressed', 'false');
    trackLayer.follow(false);
  }
  viewer.trackedEntity = undefined;
  zoomTarget = null;
  viewer.camera.cancelFlight();
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  flyHome();
}

let zoomTarget = null; // where a running zoom is heading, so quick clicks add up

function zoomView(dir) {
  hideHover();
  const cam = viewer.camera;
  // Chase cam and story orbits look at a target: zoom toward it.
  if (viewer.trackedEntity || !Cesium.Matrix4.equals(cam.transform, Cesium.Matrix4.IDENTITY)) {
    const d = Cesium.Cartesian3.magnitude(cam.position);
    return dir > 0 ? cam.zoomIn(d * 0.4) : cam.zoomOut(d * 0.6);
  }
  const from = zoomTarget || cam.positionWC.clone();
  const orientation = { heading: cam.heading, pitch: cam.pitch, roll: cam.roll };
  const direction = cam.directionWC.clone();
  cam.cancelFlight();
  const carto = Cesium.Cartographic.fromCartesian(from);
  const ground = viewer.scene.globe.getHeight(carto) ?? 0;
  const h = Math.max(1, carto.height - Math.max(0, ground));
  if ((dir < 0 && carto.height > 40e6) || (dir > 0 && h < 150)) return;
  const move = dir > 0 ? h * 0.5 : -h;
  const target = Cesium.Cartesian3.add(from, Cesium.Cartesian3.multiplyByScalar(direction, move, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  zoomTarget = target;
  const done = () => {
    if (zoomTarget === target) zoomTarget = null;
  };
  cam.flyTo({ destination: target, orientation, duration: 0.45, easingFunction: Cesium.EasingFunction.QUADRATIC_OUT, complete: done, cancel: done });
}

document.getElementById('map-controls').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  if (b.dataset.view === 'home') resetView();
  else zoomView(b.dataset.view === 'in' ? 1 : -1);
});

/* ── Top bar & keyboard ────────────────────────────────── */
document.getElementById('btn-tour').addEventListener('click', startTour);
const openFiles = () =>
  openGovFiles(
    {
      cases: CASE_ITEMS.length,
      official: officialItems.length,
      bluebook: bluebook ? bluebook.records.length.toLocaleString() : '10,763',
      geipan: geipan ? geipan.records.length.toLocaleString() : '2,768',
      mufon: mufon ? mufon.issues.length : 485,
      nuforc: nuforc ? nuforc.count.toLocaleString() : '80,332',
    },
    officialMeta ? officialMeta.items.filter((o) => !o.location) : [],
    ensureMufon(),
  );
document.getElementById('btn-files').addEventListener('click', openFiles);
document.getElementById('btn-log').addEventListener('click', openLog);
document.getElementById('btn-explain').addEventListener('click', () => openExplainNow());
const openAboutModal = () =>
  openAbout({ officialGenerated: officialMeta?.generated, bluebookGenerated: bluebook?.meta?.generated });
document.getElementById('btn-about').addEventListener('click', openAboutModal);

/* ── Map settings: OSM buildings and the user's own Google key ── */
function openMapSettingsNow() {
  openMapSettings({
    buildingsOn: state.layers.buildings,
    photoreal: { active: photoreal.active, source: photoreal.source },
    hasStoredKey: Boolean(storedGoogleKey()),
    envKey: hasEnvGoogleKey(),
    ionToken: hasIonToken(),
    onBuildings: (on) => setLayer('buildings', on),
    onSaveKey: async (key) => {
      const r = await photoreal.load({ key });
      if (r.ok) saveGoogleKey(key);
      else if (photoreal.configured) await photoreal.load();
      return r;
    },
    onRemoveKey: async () => {
      saveGoogleKey('');
      photoreal.unload();
      if (photoreal.configured) await photoreal.load();
    },
    onPhotoreal: async (on) => (on ? photoreal.load() : (photoreal.unload(), { ok: true })),
    reopen: openMapSettingsNow,
  });
}
document.getElementById('btn-map').addEventListener('click', openMapSettingsNow);

function neighbour(delta) {
  const keys = [...document.querySelectorAll('#case-list [data-key]')].map((li) => li.dataset.key);
  if (!keys.length) return;
  const i = keys.indexOf(state.selected);
  const next = i < 0 ? (delta > 0 ? 0 : keys.length - 1) : (i + delta + keys.length) % keys.length;
  select(keys[next], 'list');
}

window.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    if (document.getElementById('modal-root').children.length) return closeModal();
    if (story.active) return story.stop();
    if (trackLayer.witnessOn) return toggleWitnessView(false);
    if (tourTimer) return stopTour();
    return deselect();
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.getElementById('modal-root').children.length) return; // a dialog is open
  if (e.key === ' ' && e.target.closest?.('button, a, summary, [role="option"], [tabindex]:not(body)')) return;
  const modes = ['normal', 'nvg', 'flir', 'ironbow', 'crt'];
  if (/^[1-5]$/.test(e.key)) setMode(modes[Number(e.key) - 1]);
  else if (e.key === '/') {
    e.preventDefault();
    document.getElementById('search').focus();
  } else if (e.key === '[') neighbour(-1);
  else if (e.key === ']') neighbour(1);
  else if (e.key === ' ') {
    e.preventDefault();
    if (trackLayer.current) pb.play.click();
    else toggleHistorySweep();
  } else if (e.key.toLowerCase() === 't') startTour();
  else if (e.key.toLowerCase() === 'g') openFiles();
  else if (e.key.toLowerCase() === 'l') openLog();
  else if (e.key.toLowerCase() === 'e') openExplainNow();
  else if (e.key.toLowerCase() === 'h') document.body.classList.toggle('hud-off');
  else if (e.key === '?') openAboutModal();
  else if (e.key.toLowerCase() === 'm') openMapSettingsNow();
  else if (e.key.toLowerCase() === 'v' && trackLayer.current && trackLayer.witnessLabel) toggleWitnessView();
  else if (e.key.toLowerCase() === 'r') resetView();
  else if (e.key === '+' || e.key === '=') zoomView(1);
  else if (e.key === '-' || e.key === '_') zoomView(-1);
});

/* ── HUD ───────────────────────────────────────────────── */
const hud = {
  utc: document.getElementById('hud-utc'),
  cam: document.getElementById('hud-cam'),
  alt: document.getElementById('hud-alt'),
  map: document.getElementById('hud-map'),
};
setInterval(() => {
  const playing = trackLayer.current && (trackLayer.playing || trackLayer.progress() > 0);
  const clockText = () => Cesium.JulianDate.toDate(viewer.clock.currentTime).toISOString().slice(0, 19).replace('T', ' ');
  hud.utc.textContent = playing
    ? `▶ ${clockText()}`
    : sceneMoment
      ? `◷ ${clockText()}${sceneMoment.approx ? ' ≈' : ''}`
      : new Date().toISOString().slice(0, 19).replace('T', ' ');
  const c = viewer.camera.positionCartographic;
  hud.cam.textContent = formatDMS(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude));
  hud.alt.textContent = c.height > 1e4 ? `${(c.height / 1000).toFixed(0)} KM` : `${Math.round(c.height)} M`;
  hud.map.textContent = viewer.__mapName || '';
}, 250);

/* ── Start ─────────────────────────────────────────────── */
bindList({ onSelect: (key) => select(key, 'list') });
renderFilters();
renderLayersNow();
refresh();

/* ── Place search (Photon, keyless) ────────────────────── */
const placeList = document.getElementById('place-results');
let placeTimer = null;
let placeAbort = null;
subscribe((s, reason) => {
  if (reason !== 'search') return;
  clearTimeout(placeTimer);
  placeAbort?.abort();
  const q = s.search;
  if (!q || q.length < 3 || q.startsWith('#')) return mount(placeList, html``);
  placeTimer = setTimeout(async () => {
    placeAbort = new AbortController();
    try {
      const res = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '3', lang: 'en' })}`, { signal: placeAbort.signal });
      if (!res.ok) throw new Error(`Photon ${res.status}`);
      const json = await res.json();
      const places = (json.features || []).map((f) => ({
        name: f.properties.name,
        detail: [f.properties.state, f.properties.country].filter(Boolean).join(', '),
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        extent: f.properties.extent, // [west, north, east, south]
      }));
      mount(
        placeList,
        html`${places.map(
          (p, i) => html`<li><button type="button" data-place="${i}">⌖ <span>${p.name}${p.detail ? html` <span class="dim">· ${p.detail}</span>` : ''}</span><span class="go">FLY</span></button></li>`,
        )}`,
      );
      placeList.onclick = (e) => {
        const b = e.target.closest('[data-place]');
        if (!b) return;
        const p = places[Number(b.dataset.place)];
        const [w, n, east, sth] = p.extent || [];
        hideHover();
        viewer.camera.flyTo({
          destination: p.extent
            ? Cesium.Rectangle.fromDegrees(w, sth, east, n)
            : Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 40000),
          duration: 2.5,
        });
        const input = document.getElementById('search');
        input.value = '';
        update({ search: '' }, 'search');
        toast(`${p.name} — case files, Blue Book and civilian layers show what was reported here`, 3500);
      };
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.warn('[places]', error);
      mount(placeList, html``);
    }
  }, 450);
});

/* ── Shareable camera view: ?view=lon,lat,height,heading,pitch ── */
let viewTimer = null;
viewer.camera.moveEnd.addEventListener(() => {
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => {
    const c = viewer.camera.positionCartographic;
    const deg = Cesium.Math.toDegrees;
    const v = [deg(c.longitude).toFixed(4), deg(c.latitude).toFixed(4), Math.round(c.height), Math.round(deg(viewer.camera.heading)) % 360, Math.round(deg(viewer.camera.pitch))].join(',');
    const u = new URL(location.href);
    u.searchParams.set('view', v);
    history.replaceState(history.state, '', u);
  }, 700);
});
function viewFromParam(value) {
  const [lon, lat, h, heading, pitch] = (value || '').split(',').map(Number);
  if (![lon, lat, h].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || h <= 0) return false;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, h),
    orientation: {
      heading: Cesium.Math.toRadians(Number.isFinite(heading) ? heading : 0),
      pitch: Cesium.Math.toRadians(Number.isFinite(pitch) ? pitch : -90),
      roll: 0,
    },
  });
  return true;
}

const params = new URLSearchParams(location.search);
if (params.get('mode')) setMode(params.get('mode'));
if (params.get('layers'))
  for (const l of params.get('layers').split(',')) if (l in state.layers) setLayer(l, true);

const routed = routeFromHash();
if (!routed && !viewFromParam(params.get('view'))) flyHome(2.5);
setTimeout(() => document.getElementById('loading').classList.add('done'), 700);

// Expose for debugging and automated screenshots.
window.__uap = { viewer, select, selectBlueBook, selectGeipan, selectMufonPage, resetView, zoomView, setMode, setLayer, state, startTour, trackLayer, showLaunchPad: (i) => renderLaunchPad(launchLayer.info(i)) };
