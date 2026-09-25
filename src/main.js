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
  renderSkyCheck, closeDossier, bindDossierActions, showOcr, renderLaunchPad, renderAirspace,
} from './ui/dossier.js';
import { openGovFiles, openAbout, openLogForm, openLightbox, openMapSettings, closeModal } from './ui/modals.js';
import { toast, esc, html, mount } from './util/dom.js';
import { formatDMS, haversineKm } from './util/geo.js';

const BASE = import.meta.env.BASE_URL;
const LOG_KEY = 'gods-eye-uap:log';

/* ── Boot ──────────────────────────────────────────────── */
const viewer = await createViewer(document.getElementById('globe'));
const effects = createEffects(viewer);
const itemLayer = createItemLayer(viewer);
const trackLayer = createTrackLayer(viewer);
const bluebookLayer = createPointLayer(viewer, { name: 'bluebook', color: '#ffb547', pixelSize: 5 });
const nuforcLayer = createPointLayer(viewer, { name: 'nuforc', color: '#ff7a45', pixelSize: 2.5, alpha: 0.55, near: 1.6, far: 0.7 });
const satLayer = createSatelliteLayer(viewer, (msg) => renderLayersNow({ satellites: msg.replace(/ \(CelesTrak, live\)/, '') }));
const buildingLayer = createBuildingLayer(viewer, { onStatus: (s) => renderLayersNow({ buildings: s }) });
const photoreal = createPhotoreal(viewer, { onChange: ({ active }) => buildingLayer.suspend(active) });
const launchLayer = createLaunchLayer(viewer);
const airspaceLayer = createAirspaceLayer(viewer);

let officialMeta = null;
let officialItems = [];
let officialById = new Map();
let userItems = loadUserLog().map(userToItem);
let bluebook = null; // { meta, records }
let nuforc = null;
const layerCounts = { cases: CASE_ITEMS.length, official: '…', bluebook: '10k', nuforc: '80k', satellites: 'live', launches: 'LL2', airspace: '1.5k', buildings: 'zoom in', user: userItems.length };

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
  if (state.search && !r.place.toLowerCase().includes(state.search) && !r.id.toLowerCase().includes(state.search)) return false;
  return inYearRange(r.year);
}

const timeline = createTimeline({ onPlayToggle: toggleHistorySweep });

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
  if (nuforc && state.layers.nuforc) {
    const evOk = !state.evidence.size && (!state.status.size || state.status.has('unassessed'));
    const n = nuforcLayer.filter((i) => evOk && inYearRange(Math.floor(nuforc.date[i] / 10000)) && (!state.search || nuforc.places[nuforc.place[i]].toLowerCase().includes(state.search) || nuforc.shapes[nuforc.shape[i]] === state.search));
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
  if (['search', 'evidence', 'status', 'yearRange', 'sort', 'layers'].includes(reason)) {
    if (reason === 'evidence' || reason === 'status') renderFilters();
    refresh();
  }
});

async function applyLayers() {
  const L = state.layers;
  bluebookLayer.show = L.bluebook;
  nuforcLayer.show = L.nuforc;
  satLayer.show = L.satellites;
  buildingLayer.show = L.buildings;
  launchLayer.show = L.launches;
  if (L.launches) ensureLaunches();
  airspaceLayer.show = L.airspace;
  if (L.airspace && !airspaceLayer.count) ensureAirspaceLayer();
  if (L.bluebook && !bluebook) await ensureBlueBook();
  if (L.nuforc && !nuforc) await ensureNuforc();
  timeline.setBlueBook(L.bluebook && bluebook ? countByYear(bluebook.records.map((r) => r.year)) : null);
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
    launchesLoaded = 0;
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

function select(key, source = 'api') {
  const item = itemByKey(key);
  if (!item) return;
  if (source !== 'tour') stopTour();
  state.selected = key;
  markSelected(key);
  itemLayer.showRegion(item.kind === 'official' ? item : null);
  trackLayer.clear();
  hidePlayback();
  if (item.kind === 'case') {
    renderCase(item, { officialById, bluebookNear, airspaceFor });
    const loaded = trackLayer.load(item.ref);
    if (loaded) showPlayback();
    flyToItem(item, { tracks: !!loaded });
  } else if (item.kind === 'official') {
    renderOfficial(item, { officialById });
    flyToItem(item);
  } else if (item.kind === 'user') {
    renderUser(item, { onDelete: deleteUser });
    flyToItem(item);
  }
  setHash(`#/${item.kind}/${encodeURIComponent(item.id)}`);
  document.getElementById('hud-tgt').textContent = item.title.slice(0, 40).toUpperCase();
}

async function selectBlueBook(id) {
  stopTour();
  const bb = await ensureBlueBook();
  const rec = bb.byId.get(id);
  if (!rec) return toast('Blue Book file not found');
  if (!state.layers.bluebook) setLayer('bluebook', true);
  state.selected = null;
  markSelected(null);
  trackLayer.clear();
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

function deselect() {
  state.selected = null;
  markSelected(null);
  closeDossier();
  trackLayer.clear();
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
  const m = location.hash.match(/^#\/(case|official|user|bluebook)\/(.+)$/);
  if (!m) return false;
  const [, kind, raw] = m;
  const id = decodeURIComponent(raw);
  if (kind === 'bluebook') selectBlueBook(id);
  else select(`${kind}:${id}`, 'hash');
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

handler.setInputAction((click) => {
  stopTour();
  const hit = describePick(viewer.scene.pick(click.position));
  if (!hit) return;
  if (hit.type === 'item') select(hit.item.key, 'globe');
  else if (hit.type === 'bluebook') selectBlueBook(bluebook.records[hit.index].id);
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
    if (info) renderSatellite(info);
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
  hoverPending = true;
  requestAnimationFrame(() => {
    hoverPending = false;
    const hit = describePick(viewer.scene.pick(move.endPosition));
    let lines = null; // [title, detail] — escaped below, data is external
    if (hit?.type === 'item') lines = [hit.item.title, `${hit.item.year} · ${hit.item.place}`];
    else if (hit?.type === 'bluebook') {
      const r = bluebook.records[hit.index];
      lines = [`Blue Book · ${r.place}`, `${r.year}${r.month ? `-${String(r.month).padStart(2, '0')}` : ''} · USAF case file`];
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
    } else {
      hoverEl.classList.add('hidden');
      viewer.scene.canvas.style.cursor = '';
    }
  });
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
viewer.scene.canvas.addEventListener('pointerdown', () => stopTour());

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
  skycheck: () => {
    const item = itemByKey(state.selected);
    if (!item) return;
    if (!state.layers.satellites || !satLayer.count) {
      setLayer('satellites', true);
      renderSkyCheck(null);
      setTimeout(() => renderSkyCheck(satLayer.count ? satLayer.overhead(item.lat, item.lon) : null), 4000);
      return;
    }
    renderSkyCheck(satLayer.overhead(item.lat, item.lon));
  },
  'export-user': exportUserLog,
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
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function viewCenter() {
  const c = viewer.camera.pickEllipsoid(
    new Cesium.Cartesian2(viewer.scene.canvas.clientWidth / 2, viewer.scene.canvas.clientHeight / 2),
  );
  if (!c) return { lat: 0, lon: 0 };
  const carto = Cesium.Cartographic.fromCartesian(c);
  return { lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude) };
}
const openLog = () => openLogForm({ ...viewCenter(), onSave: addUser });

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

/* ── Guided tour ───────────────────────────────────────── */
const TOUR = [
  'kenneth-arnold-1947', 'washington-dc-1952', 'kinross-moncla-1953', 'rb-47-1957', 'hill-abduction-1961',
  'portage-county-1966', 'minot-afb-1968', 'tehran-1976', 'rendlesham-1980', 'jal-1628-1986', 'belgian-wave-1990',
  'phoenix-lights-1997', 'nimitz-tic-tac-2004',
  'aguadilla-2013', 'gimbal-gofast-2015', 'north-american-shootdowns-2023',
].filter((id) => CASES.some((c) => c.id === id));
let tourTimer = null;
let tourIndex = 0;
function tourStep() {
  const id = TOUR[tourIndex % TOUR.length];
  select(`case:${id}`, 'tour');
  setTimeout(() => {
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
  tourTimer = null;
  document.getElementById('btn-tour').textContent = '▶ TOUR';
}

/* ── Top bar & keyboard ────────────────────────────────── */
document.getElementById('btn-tour').addEventListener('click', startTour);
const openFiles = () =>
  openGovFiles(
    {
      cases: CASE_ITEMS.length,
      official: officialItems.length,
      bluebook: bluebook ? bluebook.records.length.toLocaleString() : '10,763',
      nuforc: nuforc ? nuforc.count.toLocaleString() : '80,332',
    },
    officialMeta ? officialMeta.items.filter((o) => !o.location) : [],
  );
document.getElementById('btn-files').addEventListener('click', openFiles);
document.getElementById('btn-log').addEventListener('click', openLog);
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
  select(keys[(i + delta + keys.length) % keys.length], 'list');
}

window.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') {
    if (document.getElementById('modal-root').children.length) return closeModal();
    if (trackLayer.witnessOn) return toggleWitnessView(false);
    if (tourTimer) return stopTour();
    return deselect();
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const modes = ['normal', 'nvg', 'flir', 'ironbow', 'crt'];
  if (/^[1-5]$/.test(e.key)) setMode(modes[Number(e.key) - 1]);
  else if (e.key === '/') {
    e.preventDefault();
    document.getElementById('search').focus();
  } else if (e.key === '[') neighbour(-1);
  else if (e.key === ']') neighbour(1);
  else if (e.key === ' ' && trackLayer.current) {
    e.preventDefault();
    pb.play.click();
  } else if (e.key.toLowerCase() === 't') startTour();
  else if (e.key.toLowerCase() === 'g') openFiles();
  else if (e.key.toLowerCase() === 'l') openLog();
  else if (e.key.toLowerCase() === 'h') document.body.classList.toggle('hud-off');
  else if (e.key === '?') openAboutModal();
  else if (e.key.toLowerCase() === 'm') openMapSettingsNow();
  else if (e.key.toLowerCase() === 'v' && trackLayer.current && trackLayer.witnessLabel) toggleWitnessView();
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
  hud.utc.textContent = playing
    ? `▶ ${Cesium.JulianDate.toDate(viewer.clock.currentTime).toISOString().slice(0, 19).replace('T', ' ')}`
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
      if (error.name !== 'AbortError') console.warn('[places]', error);
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
    const v = [deg(c.longitude).toFixed(4), deg(c.latitude).toFixed(4), Math.round(c.height), Math.round(deg(viewer.camera.heading)), Math.round(deg(viewer.camera.pitch))].join(',');
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
if (!routed && !viewFromParam(params.get('view')))
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-45, 28, 17_500_000),
    duration: 2.5,
  });
setTimeout(() => document.getElementById('loading').classList.add('done'), 700);

// Expose for debugging and automated screenshots.
window.__uap = { viewer, select, selectBlueBook, setMode, setLayer, state, startTour, trackLayer, showLaunchPad: (i) => renderLaunchPad(launchLayer.info(i)) };
