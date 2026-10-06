import { html, mount, raw, remount, toast, safeUrl } from '../util/dom.js';
import { t, onLanguageChange } from '../i18n/index.js';
import { formatDMS } from '../util/geo.js';
import { MOON_PLACES, MOON_INK, MOON_LAYER_GLYPH, moonGlyph, moonGroup, moonReports, searchMoon, viewHeight } from '../data/moon.js';
import { glyphSvg } from '../layers/glyphs.js';
import { sunOnMoon } from '../app/moonsun.js';
import { MODE_LABELS } from '../app/modes.js';
import { STATUS } from '../data/taxonomy.js';
import { statusBadge } from './space.js';

/**
 * The Moon, as the second world beside the Earth: the same top bar (EARTH |
 * MOON switches between them), and the same layout under it, a list of places
 * on the left with layers and search, a dossier on the right, the HUD, the
 * zoom and reset controls, the sensor looks and the lighting. The globe itself
 * lives in app/moonglobe.js and is loaded on first use; it is built when the
 * Moon opens and thrown away when it closes, so the video memory goes back to
 * the Earth.
 */
const LAYERS = [
  { id: 'report', name: 'Lunar reports', sub: 'Glows and flashes seen on the Moon, numbered' },
  { id: 'site', name: 'Landing sites', sub: 'Every landing and impact, 1959 to 2024' },
  { id: 'sea', name: 'Seas and basins', sub: 'The dark plains, and the great impact basins' },
  { id: 'crater', name: 'Craters', sub: 'More names appear as you zoom in' },
  { id: 'range', name: 'Mountains and valleys', sub: 'Ranges, valleys, rilles, a fault and a swirl' },
  { id: 'relief', name: 'Relief', sub: 'Heights from the laser altimeter, in colour', color: '#ffb547' },
];
const RELIEF_GLYPH = '<svg class="swatch" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11.5c2-2.6 3.8.9 6-1.6s4-2 6 0M2 7.5c2-2.6 3.8.9 6-1.6s4-2 6 0"/></svg>';
const KIND_LABEL = { sea: 'SEA', basin: 'BASIN', crater: 'CRATER', range: 'RANGE OR VALLEY', site: 'LANDING SITE' };
const LANDING_LABEL = { crewed: 'CREWED LANDING', impact: 'IMPACT SITE' };
/** What kind of place it is, in words: a site says whether people landed there or it was an impact. */
const kindLabel = (p) => t((p.kind === 'site' && LANDING_LABEL[p.landing]) || KIND_LABEL[p.kind]);
const GROUP_ORDER = ['report', 'site', 'sea', 'crater', 'range'];

// What the visitor chose, kept while the page is open so the Moon comes back as it was left.
const prefs = {
  layers: { report: true, site: true, sea: true, crater: true, range: true, relief: false },
  names: true,
  sort: 'kind',
  collapsed: false,
};

let open = null; // the open Moon, if any

export const isMoonOpen = () => Boolean(open);
/** The running globe, for tests and the console. */
export const moonGlobe = () => open?.globe ?? null;

const sign = (v, pos, neg) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
export const fmtLatLon = (lat, lon) => `${sign(lat, 'N', 'S')} ${sign(lon, 'E', 'W')}`;
export const moonLink = (id) => `${location.origin}${location.pathname}#/moon/${id}`;

/** What a pin or list key points at: a place or a report, and which of its positions. */
export function parseKey(key) {
  const m = /^(place|report):([^#]+)(?:#(\d+))?$/.exec(key || '');
  return m ? { kind: m[1], id: m[2], index: Number(m[3] || 0) } : null;
}

const isFar = (lon) => Math.abs(lon) > 90;
const utc = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const section = (title, content) => html`<section class="d-section"><h3>${title}</h3>${content}</section>`;

/** How high the Sun stood over a place at a moment, in degrees (below the horizon is negative). */
export function sunElevation(lat, lon, date) {
  const s = sunOnMoon(date);
  const r = Math.PI / 180;
  const up = [Math.cos(lat * r) * Math.cos(lon * r), Math.cos(lat * r) * Math.sin(lon * r), Math.sin(lat * r)];
  return Math.asin(up[0] * s.x + up[1] * s.y + up[2] * s.z) / r;
}

/** Every row the list can show: the numbered reports and the places. */
function allRows(reports) {
  return [
    ...reports.map((r) => ({ key: `report:${r.entry.id}`, group: 'report', name: r.entry.title, year: r.entry.year, report: r })),
    ...MOON_PLACES.map((p) => ({ key: `place:${p.id}`, group: moonGroup(p.kind), name: p.name, year: p.year, place: p })),
  ];
}

const SORTS = {
  kind: (a, b) =>
    GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
    (a.group === 'report' ? a.report.n - b.report.n : 0) ||
    (a.group === 'site' ? a.year - b.year : 0) ||
    a.name.localeCompare(b.name),
  date: (a, b) => (a.year ?? 1e9) - (b.year ?? 1e9) || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
};

function rowHtml(row, selectedKey) {
  const on = row.key === selectedKey ? 'true' : 'false';
  if (row.report) {
    const { entry, n, sites } = row.report;
    return html`<li class="case-item numbered" role="option" tabindex="0" data-key="${row.key}" aria-selected="${on}">
      <span class="num" aria-hidden="true">${n}</span>
      <div><div class="t">${entry.title}</div><div class="m">${entry.when}</div><div class="b">${statusBadge(entry.status)}<span class="badge">${t('LUNAR REPORT')}</span>${sites.some((s) => isFar(s.lon)) ? html`<span class="badge">${t('FAR SIDE')}</span>` : ''}</div></div>
    </li>`;
  }
  const p = row.place;
  return html`<li class="case-item glyphed" role="option" tabindex="0" data-key="${row.key}" aria-selected="${on}">
    <span class="glyph" style="color:${MOON_INK[p.kind]}">${raw(glyphSvg(moonGlyph(p), 'glyph-svg'))}</span>
    <div><div class="t">${p.name}</div><div class="m">${p.kind === 'site' ? p.when : p.english || fmtLatLon(p.lat, p.lon)}</div><div class="b"><span class="badge${p.kind === 'site' ? ' path' : ''}">${kindLabel(p)}</span>${isFar(p.lon) ? html`<span class="badge">${t('FAR SIDE')}</span>` : ''}</div></div>
  </li>`;
}

function layersHtml(counts) {
  return html`${LAYERS.map(
    (l) => html`<button type="button" class="layer" data-moon-layer="${l.id}" aria-pressed="${prefs.layers[l.id] ? 'true' : 'false'}" style="color:${l.color || MOON_INK[l.id]}">
      ${raw(l.id === 'relief' ? RELIEF_GLYPH : glyphSvg(MOON_LAYER_GLYPH[l.id]))}
      <span style="color:var(--text-primary)"><span class="name">${t(l.name)}</span><span class="sub">${t(l.sub)}</span></span>
      <span class="state">${counts[l.id] ?? ''}</span>
    </button>`,
  )}`;
}
function placeDossier(p) {
  const sun = p.moment ? sunElevation(p.lat, p.lon, new Date(p.moment.at)) : null;
  return html`
    <div class="d-title">${p.name}</div>
    <div class="d-sub">${p.english ? html`${p.english}<br />` : ''}${p.when ? html`${p.when}<br />` : ''}${formatDMS(p.lat, p.lon)}</div>
    <div class="d-badges"><span class="badge${p.kind === 'site' ? ' path' : ''}">${kindLabel(p)}</span><span class="badge">${t(isFar(p.lon) ? 'FAR SIDE' : 'NEAR SIDE')}</span></div>
    <div class="btn-row" style="margin:10px 0 0"><button type="button" class="chip on" data-moon="fly">◎ ${t('FLY THERE')}</button><button type="button" class="chip" data-copy="${p.id}">${t('⧉ COPY LINK')}</button></div>
    ${p.note ? section(t('ABOUT'), html`<div class="d-text"><p>${p.note}</p></div>`) : ''}
    ${p.moment
      ? section(
          t('LANDING'),
          html`<dl class="d-kv"><dt>UTC</dt><dd class="mono">${utc(new Date(p.moment.at))}${p.moment.approx ? ' ≈' : ''}</dd><dt>${t('SUN')}</dt><dd>${t(sun >= 0 ? '{n}° above the horizon' : '{n}° below the horizon', { n: Math.abs(sun).toFixed(1) })}</dd></dl>
          <p class="caveat">${t('With the lighting on AUTO, the map shows the Sun as it stood at the landing.')}</p>`,
        )
      : ''}
    ${section(
      t('POSITION'),
      html`<dl class="d-kv"><dt>${t('LATITUDE')}</dt><dd class="mono">${sign(p.lat, 'N', 'S')}</dd><dt>${t('LONGITUDE')}</dt><dd class="mono">${sign(p.lon, 'E', 'W')}</dd></dl>`,
    )}`;
}

function reportDossier(r, officialById) {
  const e = r.entry;
  const files = (e.official || []).map((id) => officialById.get(String(id))).filter(Boolean);
  return html`
    <div class="d-title">${e.title}</div>
    <div class="d-sub">${e.when}<br />${e.where}<br />${formatDMS(r.sites[0].lat, r.sites[0].lon)}</div>
    <div class="d-badges">${statusBadge(e.status)}<span class="badge">${t('LUNAR REPORT')} ${r.n}</span>${r.sites.some((s) => isFar(s.lon)) ? html`<span class="badge">${t('FAR SIDE')}</span>` : ''}</div>
    <div class="btn-row" style="margin:10px 0 0"><button type="button" class="chip on" data-moon="fly">◎ ${t('FLY THERE')}</button>${e.earth ? html`<button type="button" class="chip" data-fly="${e.id}">${t('SHOW ON THE GLOBE')}</button>` : ''}<button type="button" class="chip" data-copy="${e.id}">${t('⧉ COPY LINK')}</button></div>
    ${section(t('ASSESSMENT'), html`<div class="explain"><b>${t(STATUS[e.status]?.label || e.status)}</b>${e.explanation}</div>`)}
    ${section(t('SUMMARY'), html`<div class="d-text"><p>${e.summary}</p></div>`)}
    ${r.sites.length > 1
      ? section(
          t('ON THE MOON'),
          html`<ul class="source-list">${r.sites.map((s, i) => html`<li><span class="badge">${r.n}</span><span><button type="button" class="link-btn moon-site" data-key="report:${e.id}#${i}">${s.label}</button> · <span class="mono">${fmtLatLon(s.lat, s.lon)}</span></span></li>`)}</ul>`,
        )
      : ''}
    ${files.length
      ? section(t('NASA FILES'), html`<ul class="source-list">${files.map((f) => html`<li><span class="badge official">${t('OFFICIAL')}</span><a href="#/official/${f.dvidsId}">${f.title}</a></li>`)}</ul>`)
      : ''}
    ${section(
      t('SOURCES'),
      html`<ul class="source-list">${e.sources.map((s) => html`<li><span class="badge">${(s.kind || 'ref').toUpperCase()}</span><a href="${safeUrl(s.url)}" target="_blank" rel="noopener">${s.label}</a></li>`)}</ul>`,
    )}`;
}

const ICON = {
  in: '<path d="M8 3v10M3 8h10" />',
  out: '<path d="M3 8h10" />',
  names: '<path d="M3 13 7 3l4 10M4.6 9h4.8M12.5 6.5v6.5" />',
  home: '<circle cx="8" cy="8" r="5" /><path d="M8 1v3M8 12v3M1 8h3M12 8h3" /><circle cx="8" cy="8" r="1.2" class="dot" />',
};
const svg = (name) => raw(`<svg viewBox="0 0 16 16" aria-hidden="true">${ICON[name]}</svg>`);

/**
 * @param {object} o
 * @param {string} o.base          the app's base URL
 * @param {Map}    o.officialById  official releases, for the NASA files of a report
 * @param {string} [o.focus]       the id of a place or report to open on
 * @param {object} [o.profile]     the device's rendering budget (deviceProfile)
 * @param {string} [o.mode]        the sensor look (normal, nvg, …), shared with the Earth
 * @param {string} [o.lighting]    auto, day, night or off, shared with the Earth
 * @param {(id: string|null) => void} [o.onRoute]   what is selected changed (for the address)
 * @param {(o: {silent: boolean}) => void} [o.onClose] the Moon closed
 * @param {(earth: {lat: number, lon: number}) => void} [o.onFly]  go back to the Earth and fly somewhere
 */
export async function openMoon({ base, officialById = new Map(), focus, profile = {}, mode = 'normal', lighting = 'auto', onRoute, onClose, onFly } = {}) {
  if (open) {
    open.focus(focus);
    return open;
  }
  const reports = moonReports();
  const rows = allRows(reports);
  const lastFocus = document.activeElement;
  const earthCollapsed = document.body.classList.contains('left-collapsed');
  const root = document.createElement('div');
  root.id = 'moon-view';
  root.className = 'moon-view';
  mount(
    root,
    html`
    <div class="moon-globe" id="moon-globe" tabindex="0" role="main" aria-label="${t('Interactive map of the Moon. Drag to turn it, scroll to zoom. With the keyboard, arrow keys turn it and plus and minus zoom.')}"></div>
    <div class="moon-scope" aria-hidden="true"></div>

    <aside id="moon-left" class="panel glass" aria-label="${t('Places on the Moon')}">
      <div class="panel-head">
        <span class="panel-title">${t('THE MOON')}</span>
        <span class="muted mono" id="moon-count"></span>
        <button type="button" class="icon-btn" id="moon-collapse" data-moon="collapse" aria-label="${t('Collapse panel')}" aria-expanded="true" title="${t('Collapse')}">‹</button>
      </div>
      <div class="panel-body">
        <input id="moon-search" type="search" placeholder="${t('Search craters, seas, landing sites, reports…')}" aria-label="${t('Search the Moon')}" autocomplete="off" />
        <div class="section-label">${t('LAYERS')}</div>
        <div id="moon-layers" class="layer-list"></div>
        <div class="section-label list-label">
          <span>${t('RESULTS')}</span>
          <select id="moon-sort" aria-label="${t('Sort places')}">
            <option value="kind">${t('By kind')}</option>
            <option value="date">${t('Oldest first')}</option>
            <option value="name">${t('A–Z')}</option>
          </select>
        </div>
        <ul id="moon-list" class="case-list" role="listbox" aria-label="${t('Places on the Moon')}"></ul>
        <p class="made-by">made by <a href="https://github.com/domw99" target="_blank" rel="noopener">domw99</a></p>
      </div>
    </aside>

    <aside id="moon-dossier" class="panel glass hidden" tabindex="-1" aria-label="${t('Dossier')}">
      <div class="panel-head">
        <span class="panel-title">${t('DOSSIER')}</span>
        <span id="moon-dossier-id" class="muted mono"></span>
        <button type="button" class="icon-btn mobile-only" data-moon="peek" aria-label="${t('Shrink dossier to see the globe')}" title="${t('Show globe')}">⌄</button>
        <button type="button" class="icon-btn" data-moon="close-dossier" aria-label="${t('Close dossier')}" title="${t('Close (Esc)')}">✕</button>
      </div>
      <div id="moon-dossier-body" class="panel-body"></div>
    </aside>

    <div class="hud mono" role="region" aria-label="${t('Camera readout')}" aria-live="off">
      <div class="hud-tl">
        <div><span class="muted">UTC</span> <span data-hud="utc">--</span></div>
        <div><span class="muted">SENSOR</span> <span data-hud="mode">EO / NORMAL</span></div>
        <div><span class="muted">MAP</span> <span data-hud="map">--</span></div>
      </div>
      <div class="hud-br">
        <div><span class="muted">CAM</span> <span data-hud="cam">--</span></div>
        <div><span class="muted">ALT</span> <span data-hud="alt">--</span></div>
        <div><span class="muted">TGT</span> <span data-hud="tgt">${t('NONE')}</span></div>
        <div class="made-by">made by <a href="https://github.com/domw99" target="_blank" rel="noopener">domw99</a></div>
      </div>
      <div class="crosshair" aria-hidden="true"></div>
    </div>

    <div class="map-controls glass" role="region" aria-label="${t('Map view')}">
      <button type="button" data-moon="in" title="${t('Zoom in toward the centre (+)')}" aria-label="${t('Zoom in')}">${svg('in')}</button>
      <button type="button" data-moon="out" title="${t('Zoom out (−)')}" aria-label="${t('Zoom out')}">${svg('out')}</button>
      <button type="button" data-moon="names" aria-pressed="${prefs.names ? 'true' : 'false'}" title="${t('Names on the map (N)')}" aria-label="${t('Names on the map')}">${svg('names')}</button>
      <button type="button" data-moon="home" class="reset" title="${t('Reset view: the whole Moon, north up (R)')}" aria-label="${t('Reset view')}">${svg('home')}<span>${t('RESET')}</span></button>
    </div>

    <div class="thermal-scale mono" aria-hidden="true"><span>COLD</span><i></i><span>HOT</span></div>
    <div class="moon-tip hover-label" hidden></div>
    <div class="moon-credit" role="region" aria-label="${t('Picture credits')}"><span id="moon-credit-text"></span><div id="moon-credits"></div></div>`,
  );
  document.body.append(root);
  document.body.classList.add('moon-open');

  const $ = (sel) => root.querySelector(sel);
  const left = $('#moon-left');
  const dossier = $('#moon-dossier');
  const dossierBody = $('#moon-dossier-body');
  const listEl = $('#moon-list');
  const searchEl = $('#moon-search');
  const sortEl = $('#moon-sort');
  const tip = $('.moon-tip');
  const hudEl = Object.fromEntries([...root.querySelectorAll('[data-hud]')].map((el) => [el.dataset.hud, el]));
  const placeById = new Map(MOON_PLACES.map((p) => [p.id, p]));
  const reportById = new Map(reports.map((r) => [r.entry.id, r]));
  $('#moon-credit-text').textContent = t('Imagery: NASA/GSFC/Arizona State University (LRO Camera), via NASA Moon Trek.');
  sortEl.value = prefs.sort;

  let globe = null;
  let selected = null; // { kind, id, index }
  let closed = false;
  let box = null; // the globe's rectangle, for placing the tooltip
  let searchTimer;
  let pending = focus; // asked for before the globe was ready
  let sensor = mode;
  let lightMode = lighting;
  let lit = null; // the moment the map is lit by, when it is

  // ── The list ──
  const counts = () => ({
    report: reports.length,
    ...Object.fromEntries(['site', 'sea', 'crater', 'range'].map((g) => [g, MOON_PLACES.filter((p) => moonGroup(p.kind) === g).length])),
  });
  function renderLayers() {
    remount($('#moon-layers'), layersHtml(counts()));
  }
  function renderList() {
    const query = searchEl.value.trim();
    let shown = rows.filter((r) => prefs.layers[r.group]);
    if (query) {
      const found = searchMoon(query, MOON_PLACES, reports);
      const keys = new Set([...found.reports.map((r) => `report:${r.entry.id}`), ...found.places.map((p) => `place:${p.id}`)]);
      shown = shown.filter((r) => keys.has(r.key));
    }
    shown.sort(SORTS[prefs.sort] || SORTS.kind);
    $('#moon-count').textContent = t('{n} shown', { n: shown.length });
    const key = selected ? `${selected.kind}:${selected.id}` : null;
    mount(
      listEl,
      shown.length
        ? html`${shown.map((r) => rowHtml(r, key))}`
        : html`<li class="case-empty">${t('Nothing matches. Try a crater, a sea, a mission or a year.')}${prefs.layers.report && prefs.layers.site && prefs.layers.sea && prefs.layers.crater && prefs.layers.range ? '' : html`<br /><span class="dim">${t('Some layers are off.')}</span>`}</li>`,
    );
  }
  function markSelected() {
    const key = selected ? `${selected.kind}:${selected.id}` : null;
    for (const li of listEl.querySelectorAll('.case-item')) li.setAttribute('aria-selected', li.dataset.key === key ? 'true' : 'false');
    if (key) listEl.querySelector(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // ── Panels: collapsing the list, opening and closing the dossier ──
  function setCollapsed(on) {
    prefs.collapsed = on;
    left.classList.toggle('collapsed', on);
    document.body.classList.toggle('left-collapsed', on);
    const b = $('#moon-collapse');
    b.setAttribute('aria-expanded', String(!on));
    b.setAttribute('aria-label', t(on ? 'Expand panel' : 'Collapse panel'));
    box = null;
    resizeSoon();
  }
  function setDossier(on) {
    dossier.classList.toggle('hidden', !on);
    if (!on) dossier.classList.remove('peek');
    document.body.classList.toggle('dossier-open', on);
  }
  // On a phone the globe shrinks to the space above the list, so it follows the panels' moves.
  let resizeTimer;
  const resizeSoon = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => globe?.resize(), 320);
  };

  // ── Selection ──
  const positionOf = (sel, index = 0) => (sel.kind === 'report' ? reportById.get(sel.id)?.sites[index] : placeById.get(sel.id));
  const momentOf = (sel) => (sel?.kind === 'report' ? reportById.get(sel.id)?.entry.moment : sel ? placeById.get(sel.id)?.moment : null);
  const nameOf = (sel) => (sel.kind === 'report' ? reportById.get(sel.id)?.entry.title : placeById.get(sel.id)?.name) || '';

  function showDossier(sel) {
    const content = sel.kind === 'report' ? reportDossier(reportById.get(sel.id), officialById) : placeDossier(placeById.get(sel.id));
    mount(dossierBody, content);
    $('#moon-dossier-id').textContent = sel.id.toUpperCase();
    dossierBody.scrollTop = 0;
    setDossier(true);
  }

  function flyToSelected() {
    if (!selected) return;
    const at = positionOf(selected, selected.index);
    if (!at) return;
    const height = selected.kind === 'report' ? 900_000 : viewHeight(placeById.get(selected.id));
    globe?.flyTo({ lat: at.lat, lon: at.lon, height });
  }

  function choose(key, { fly = true, quiet = false } = {}) {
    const k = parseKey(key);
    if (!k || (k.kind === 'report' ? !reportById.has(k.id) : !placeById.has(k.id))) return false;
    selected = k;
    const at = positionOf(k, k.index);
    showDossier(k);
    markSelected();
    globe?.select(key, at);
    if (fly) flyToSelected();
    hudEl.tgt.textContent = nameOf(k).slice(0, 40).toUpperCase();
    applyLight();
    if (!quiet) onRoute?.(k.id);
    return true;
  }
  function clearSelection({ quiet = false } = {}) {
    const hadFocus = dossier.contains(document.activeElement);
    const was = selected;
    selected = null;
    setDossier(false);
    markSelected();
    globe?.select(null);
    hudEl.tgt.textContent = t('NONE');
    applyLight();
    if (!quiet) onRoute?.(null);
    // The focus was in the dossier, which is gone: back to the row it came from.
    if (hadFocus) (was && listEl.querySelector(`[data-key="${CSS.escape(`${was.kind}:${was.id}`)}"]`) || $('#moon-globe')).focus();
  }
  /** Open on an id (a report or a place), or ignore one that isn't there. */
  const focusOn = (id) => {
    if (!id) return false;
    if (reportById.has(id)) return choose(`report:${id}`);
    if (placeById.has(id)) return choose(`place:${id}`);
    return false;
  };
  function neighbour(delta) {
    const keys = [...listEl.querySelectorAll('[data-key]')].map((li) => li.dataset.key);
    if (!keys.length) return;
    const key = selected ? `${selected.kind}:${selected.id}` : null;
    const i = keys.indexOf(key);
    choose(keys[i < 0 ? (delta > 0 ? 0 : keys.length - 1) : (i + delta + keys.length) % keys.length]);
  }

  // ── Lighting, the sensor look and the HUD ──
  function applyLight() {
    const m = momentOf(selected);
    const how = lightMode === 'auto' ? (m ? 'moment' : 'off') : lightMode;
    lit = how === 'moment' ? m : null;
    globe?.setLight(how, lit && new Date(lit.at));
    updateHud();
  }
  function updateHud() {
    hudEl.utc.textContent = lit ? `◷ ${utc(new Date(lit.at))}${lit.approx ? ' ≈' : ''}` : utc(new Date());
    hudEl.mode.textContent = MODE_LABELS[sensor] || MODE_LABELS.normal;
    hudEl.map.textContent = `${prefs.layers.relief ? 'LRO WAC + LOLA RELIEF' : 'LRO WAC MOSAIC'}${lightMode !== 'auto' ? ` · ${lightMode.toUpperCase()}` : ''}`;
  }
  const clock = setInterval(() => !lit && !document.hidden && updateHud(), 1000);

  // ── Layers and names ──
  function setLayer(id, on) {
    prefs.layers[id] = on;
    if (id === 'relief') globe?.setStyle(on ? 'relief' : 'photo');
    else globe?.setGroups({ [id]: on });
    renderLayers();
    renderList();
    updateHud();
  }
  function toggleNames() {
    prefs.names = !prefs.names;
    globe?.setNames(prefs.names);
    $('[data-moon="names"]').setAttribute('aria-pressed', String(prefs.names));
  }

  // ── Closing ──
  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    clearTimeout(searchTimer);
    clearTimeout(resizeTimer);
    clearInterval(clock);
    stopLanguage();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    globe?.destroy();
    root.remove();
    document.body.classList.remove('moon-open', 'dossier-open');
    // The Earth's panels are as they were.
    document.body.classList.toggle('left-collapsed', earthCollapsed);
    open = null;
    if (!silent && lastFocus?.isConnected) lastFocus.focus?.();
    onClose?.({ silent });
  }

  // ── Keys ──
  // The keys the two worlds share (sensor looks, lighting, the dialogs, U for the Earth) are in main.js.
  function onKey(e) {
    if (document.getElementById('modal-root')?.children.length) return; // a dialog over the Moon has the keys
    if (e.key === 'Escape') {
      if (e.target === searchEl && searchEl.value) {
        searchEl.value = '';
        renderList();
      } else if (selected) clearSelection();
      else return; // nothing open here: main.js goes back to the Earth
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const turn = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    const k = e.key.toLowerCase();
    if (turn) {
      if (e.target.closest?.('button, a, [role="radio"], [role="option"]')) return;
      globe?.turn(...turn);
    } else if (e.key === '+' || e.key === '=') globe?.zoom(1.6);
    else if (e.key === '-' || e.key === '_') globe?.zoom(1 / 1.6);
    else if (e.key === '0' || k === 'r') globe?.home();
    else if (k === 'n') toggleNames();
    else if (e.key === '[') neighbour(-1);
    else if (e.key === ']') neighbour(1);
    else if (e.key === '/') {
      if (prefs.collapsed) setCollapsed(false);
      searchEl.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);
  const onResize = () => {
    box = null;
    globe?.resize();
  };
  window.addEventListener('resize', onResize);
  const stopLanguage = onLanguageChange(() => {
    renderLayers();
    renderList();
    if (selected) showDossier(selected);
    $('#moon-credit-text').textContent = t('Imagery: NASA/GSFC/Arizona State University (LRO Camera), via NASA Moon Trek.');
    hudEl.tgt.textContent = selected ? nameOf(selected).slice(0, 40).toUpperCase() : t('NONE');
  });

  // ── Clicks ──
  root.addEventListener('click', (e) => {
    const item = e.target.closest('.case-item[data-key], .moon-site[data-key]');
    if (item) return void choose(item.dataset.key);
    const layer = e.target.closest('[data-moon-layer]');
    if (layer) return void setLayer(layer.dataset.moonLayer, !prefs.layers[layer.dataset.moonLayer]);
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const url = moonLink(copy.dataset.copy);
      if (!navigator.clipboard?.writeText) return void toast(url, 6000);
      navigator.clipboard.writeText(url).then(
        () => toast('Link copied'),
        () => toast(url, 6000),
      );
      return;
    }
    if (e.target.closest('[data-fly]')) {
      const entry = reportById.get(selected?.id)?.entry;
      if (entry?.earth) onFly?.(entry.earth);
      return;
    }
    const act = e.target.closest('[data-moon]')?.dataset.moon;
    if (act === 'home') globe?.home();
    else if (act === 'in') globe?.zoom(1.6);
    else if (act === 'out') globe?.zoom(1 / 1.6);
    else if (act === 'names') toggleNames();
    else if (act === 'fly') flyToSelected();
    else if (act === 'close-dossier') clearSelection();
    else if (act === 'collapse') setCollapsed(!prefs.collapsed);
    else if (act === 'peek') {
      const peek = dossier.classList.toggle('peek');
      e.target.closest('button').setAttribute('aria-expanded', String(!peek));
    }
  });
  listEl.addEventListener('keydown', (e) => {
    const li = e.target.closest('[data-key]');
    if (!li) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(li.dataset.key);
      // From the keyboard, carry on in the dossier instead of leaving the focus in the list.
      dossier.focus({ preventScroll: true });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      (e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling)?.focus();
    }
  });
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 120);
  });
  sortEl.addEventListener('change', () => {
    prefs.sort = sortEl.value;
    renderList();
  });

  renderLayers();
  renderList();
  updateHud();
  if (prefs.collapsed) setCollapsed(true);
  else document.body.classList.remove('left-collapsed');

  // ── The globe ──
  let tipText = '';
  const api = {
    focus: (id) => {
      if (!globe) pending = id;
      else if (!id) {
        clearSelection({ quiet: true });
        globe.home();
      } else focusOn(id);
    },
    /** The sensor look, shared with the Earth. */
    setMode(m) {
      sensor = m;
      globe?.setMode(m);
      updateHud();
    },
    /** auto, day, night or off, shared with the Earth. */
    setLighting(m) {
      lightMode = m;
      applyLight();
    },
    close,
    get selected() {
      return selected;
    },
    get globe() {
      return globe;
    },
  };
  open = api;
  let made;
  try {
    const { createMoonGlobe } = await import('../app/moonglobe.js');
    if (closed) return api;
    made = await createMoonGlobe($('#moon-globe'), {
      base,
      profile,
      creditContainer: $('#moon-credits'),
      onSelect: (key) => {
        if (key) choose(key, { fly: false });
      },
      onHover: (key, at) => {
        const k = parseKey(key);
        if (!k || !at) return void (tip.hidden = true);
        const r = k.kind === 'report' ? reportById.get(k.id) : null;
        const text = r ? `${r.n}. ${r.entry.title}` : placeById.get(k.id)?.name;
        if (text !== tipText) {
          tipText = text;
          tip.textContent = text;
        }
        box ||= $('.moon-globe').getBoundingClientRect(); // the globe's corner on the page, kept until the layout changes
        tip.style.left = `${box.left + at.x}px`;
        tip.style.top = `${box.top + at.y}px`;
        tip.hidden = false;
      },
      onView: ({ lat, lon, height }) => {
        hudEl.cam.textContent = formatDMS(lat, lon);
        hudEl.alt.textContent = height > 1e4 ? `${(height / 1000).toFixed(0)} KM` : `${Math.round(height)} M`;
      },
      onOffline: () => toast('NASA’s detailed Moon pictures can’t be reached right now. Showing the low-resolution map.', 6000),
      coveredTop: () => Math.max(0, (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) - $('#moon-globe').getBoundingClientRect().top),
    });
  } catch (error) {
    console.warn('[moon]', error);
    if (!closed) {
      toast('The Moon map could not start on this device');
      close();
    }
    return null;
  }
  if (closed) {
    made.destroy();
    return api;
  }
  globe = made;
  globe.setPlaces({ places: MOON_PLACES, reports });
  globe.setGroups(Object.fromEntries(GROUP_ORDER.map((g) => [g, prefs.layers[g]])));
  if (prefs.layers.relief) globe.setStyle('relief');
  if (!prefs.names) globe.setNames(false);
  globe.setMode(sensor);
  globe.active = true;
  if (!focusOn(pending)) {
    applyLight();
    $('#moon-globe').focus({ preventScroll: true });
  }
  return api;
}

/** Close the Moon, if it is open. `silent` leaves the focus and the address to the caller. */
export function closeMoon(options) {
  open?.close(options);
}
/** The sensor look and the lighting are chosen in the top bar, for whichever world is showing. */
export const setMoonMode = (mode) => open?.setMode(mode);
export const setMoonLighting = (mode) => open?.setLighting(mode);
