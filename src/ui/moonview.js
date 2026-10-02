import { html, mount, toast } from '../util/dom.js';
import { t } from '../i18n/index.js';
import { MOON_PLACES, moonReports, searchMoon, viewHeight } from '../data/moon.js';
import { spaceCard } from './space.js';

/**
 * The Moon map: a full-screen globe of the Moon with the same controls as the
 * Earth one (drag to turn it, scroll or pinch to zoom), a list of places to
 * fly to, and the lunar reports from Space & Moon as numbered pins. The globe
 * itself lives in app/moonglobe.js and is loaded on first use; it is built when
 * the map opens and thrown away when it closes, so the video memory goes back
 * to the Earth.
 */
const GROUPS = [
  ['site', 'LANDING SITES'],
  ['sea', 'SEAS & BASINS'],
  ['crater', 'CRATERS'],
  ['range', 'MOUNTAINS, VALLEYS & MORE'],
];
const KIND_LABEL = { sea: 'SEA', basin: 'BASIN', crater: 'CRATER', range: 'RANGE OR VALLEY', site: 'LANDING SITE' };
const groupOf = (p) => (p.kind === 'basin' ? 'sea' : p.kind);

let open = null; // the one open map, if any

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

function setBackgroundInert(on, keep) {
  for (const el of document.body.children) {
    if (el === keep || el.id === 'modal-root' || el.id === 'toast' || el.tagName === 'SCRIPT') continue;
    el.toggleAttribute('inert', on);
  }
}

function listHtml(query, reports) {
  const found = query.trim() ? searchMoon(query) : { reports, places: MOON_PLACES };
  const reportRows = found.reports.map(
    (r) => html`<li><button type="button" class="moon-item" data-key="report:${r.entry.id}"><span class="sc-num" aria-hidden="true">${r.n}</span><span class="mi-text"><span class="mi-name">${r.entry.title}</span><span class="mi-note">${r.entry.when}</span></span></button></li>`,
  );
  const groups = GROUPS.map(([kind, title]) => {
    const rows = found.places
      .filter((p) => groupOf(p) === kind)
      .sort((a, b) => (kind === 'site' ? a.year - b.year : 0) || a.name.localeCompare(b.name))
      .map(
        (p) => html`<li><button type="button" class="moon-item" data-key="place:${p.id}"><span class="mi-text"><span class="mi-name">${p.name}</span><span class="mi-note">${p.when ? `${p.when} · ` : ''}${p.english || p.note || ''}</span></span></button></li>`,
      );
    return rows.length ? html`<section class="moon-group"><h3>${t(title)} · ${rows.length}</h3><ul>${rows}</ul></section>` : '';
  });
  const none = !reportRows.length && !found.places.length;
  return html`${reportRows.length ? html`<section class="moon-group"><h3>${t('REPORTS ON THE MOON')} · ${reportRows.length}</h3><ul>${reportRows}</ul></section>` : ''}${groups}${none ? html`<p class="muted moon-none">${t('Nothing matches. Try a crater, a sea, a mission or a year.')}</p>` : ''}`;
}

function placeDetail(p) {
  return html`<div class="moon-detail">
    <button type="button" class="chip small" data-moon="all">← ${t('ALL PLACES')}</button>
    <div class="sc-head"><span class="badge">${t(KIND_LABEL[p.kind])}</span>${p.when ? html`<span class="sc-when mono">${p.when}</span>` : ''}</div>
    <h3>${p.name}</h3>
    ${p.english ? html`<div class="sc-where">${p.english}</div>` : ''}
    <div class="sc-where mono">${fmtLatLon(p.lat, p.lon)}</div>
    ${p.note ? html`<p>${p.note}</p>` : ''}
    <div class="sc-actions"><button type="button" class="chip" data-copy="${p.id}">${t('⧉ COPY LINK')}</button></div>
  </div>`;
}

/**
 * @param {object} o
 * @param {string} o.base          the app's base URL
 * @param {Map}    o.officialById  official releases, for the NASA files on a report's card
 * @param {string} [o.focus]       the id of a place or report to open on
 * @param {object} [o.profile]     the device's rendering budget (deviceProfile)
 * @param {(id: string|null) => void} [o.onRoute]   what is selected changed (for the address)
 * @param {() => void} [o.onClose] the map closed
 * @param {(earth: {lat: number, lon: number}) => void} [o.onFly]  fly the Earth globe somewhere
 */
export async function openMoon({ base, officialById = new Map(), focus, profile = {}, onRoute, onClose, onFly } = {}) {
  if (open) {
    open.focus(focus);
    return open;
  }
  const reports = moonReports();
  const lastFocus = document.activeElement;
  const root = document.createElement('section');
  root.id = 'moon-view';
  root.className = 'moon-view';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'moon-title');
  mount(
    root,
    html`
    <div class="moon-globe" id="moon-globe" tabindex="0" role="group" aria-label="${t('Interactive map of the Moon. Drag to turn it, scroll to zoom. With the keyboard, arrow keys turn it and plus and minus zoom.')}"></div>
    <header class="moon-top glass">
      <button type="button" class="chip" data-moon="close" title="${t('Back to the Earth (Esc)')}">← ${t('EARTH')}</button>
      <div class="moon-heading"><b id="moon-title">${t('THE MOON')}</b><span class="muted">${t('INTERACTIVE MAP')}</span></div>
      <div class="moon-tools">
        <div class="moon-styles" role="radiogroup" aria-label="${t('Map style')}">
          <button type="button" class="chip on" role="radio" aria-checked="true" data-style="photo" title="${t('Photographs from the Lunar Reconnaissance Orbiter')}">${t('PHOTO')}</button>
          <button type="button" class="chip" role="radio" aria-checked="false" data-style="relief" title="${t('Height above and below the average, in colour')}">${t('RELIEF')}</button>
        </div>
        <button type="button" class="chip on" data-moon="names" aria-pressed="true" title="${t('Names on the map (N)')}">${t('NAMES')}</button>
        <button type="button" class="chip" data-moon="home" title="${t('Back to the whole Moon (0)')}">${t('RESET VIEW')}</button>
      </div>
    </header>
    <aside class="moon-panel glass" aria-label="${t('Places on the Moon')}">
      <div class="panel-head"><span class="panel-title">${t('PLACES')}</span><span class="muted"></span><button type="button" class="icon-btn moon-fold" data-moon="fold" aria-label="${t('Show or hide the list')}" aria-expanded="true">▾</button></div>
      <div class="panel-body">
        <input type="search" id="moon-search" class="moon-search" placeholder="${t('Search craters, seas, landing sites, reports…')}" aria-label="${t('Search the Moon')}" autocomplete="off" />
        <div id="moon-list">${listHtml('', reports)}</div>
        <div id="moon-detail" hidden></div>
      </div>
    </aside>
    <div class="moon-hud mono" aria-hidden="true"><span id="moon-pos">—</span><span id="moon-alt"></span></div>
    <div class="moon-zoom glass">
      <button type="button" class="icon-btn" data-moon="in" aria-label="${t('Zoom in')}" title="${t('Zoom in')}">+</button>
      <button type="button" class="icon-btn" data-moon="out" aria-label="${t('Zoom out')}" title="${t('Zoom out')}">−</button>
    </div>
    <div class="moon-tip hover-label" hidden></div>
    <div class="moon-credit"><span id="moon-credit-text"></span><div id="moon-credits"></div></div>`,
  );
  document.body.append(root);
  document.body.classList.add('moon-open');
  setBackgroundInert(true, root);

  const $ = (sel) => root.querySelector(sel);
  const listEl = $('#moon-list');
  const detailEl = $('#moon-detail');
  const searchEl = $('#moon-search');
  const tip = $('.moon-tip');
  const countEl = $('.moon-panel .muted');
  const placeById = new Map(MOON_PLACES.map((p) => [p.id, p]));
  const reportById = new Map(reports.map((r) => [r.entry.id, r]));
  const credit = $('#moon-credit-text');
  credit.textContent = t('Imagery: NASA/GSFC/Arizona State University (LRO Camera), via NASA Moon Trek.');
  countEl.textContent = `${MOON_PLACES.length + reports.length}`;

  let globe = null;
  let selected = null; // { kind, id }
  let closed = false;
  let box = null; // the globe's rectangle, for placing the tooltip
  let previous = null; // the key of the last row opened, so Back to the list can return to it
  let searchTimer;
  let pending = focus; // asked for before the globe was ready

  // ── Selection ──
  const positionOf = (sel, index = 0) => (sel.kind === 'report' ? reportById.get(sel.id)?.sites[index] : placeById.get(sel.id));

  function showDetail(sel) {
    const inPanel = root.querySelector('.moon-panel').contains(document.activeElement);
    if (!sel) {
      detailEl.hidden = true;
      listEl.hidden = false;
      searchEl.hidden = false;
      // Back to the list: the focus returns to the row that was open.
      if (inPanel && previous) listEl.querySelector(`[data-key="${CSS.escape(previous)}"]`)?.focus({ preventScroll: false });
      return;
    }
    const content =
      sel.kind === 'report'
        ? html`<div class="moon-detail"><button type="button" class="chip small" data-moon="all">← ${t('ALL PLACES')}</button><ol class="space-list">${spaceCard(reportById.get(sel.id).entry, { officialById, number: reportById.get(sel.id).n })}</ol></div>`
        : placeDetail(placeById.get(sel.id));
    mount(detailEl, content);
    detailEl.hidden = false;
    listEl.hidden = true;
    searchEl.hidden = true;
    detailEl.closest('.panel-body').scrollTop = 0;
    if (inPanel) detailEl.querySelector('[data-moon="all"]')?.focus(); // the row that had the focus is gone
  }

  function choose(key, { fly = true, quiet = false } = {}) {
    const k = parseKey(key);
    if (!k || (k.kind === 'report' ? !reportById.has(k.id) : !placeById.has(k.id))) return false;
    selected = k;
    previous = `${k.kind}:${k.id}`;
    const at = positionOf(k, k.index);
    showDetail(k);
    globe?.select(key, at);
    if (fly && at) {
      const height = k.kind === 'report' ? 900_000 : viewHeight(placeById.get(k.id));
      globe?.flyTo({ lat: at.lat, lon: at.lon, height });
    }
    if (!quiet) onRoute?.(k.id);
    if (root.classList.contains('folded')) {
      root.classList.remove('folded');
      root.querySelector('.moon-panel').classList.remove('collapsed');
      root.querySelector('.moon-fold').setAttribute('aria-expanded', 'true');
      box = null;
      globe?.resize();
    }
    return true;
  }
  function clearSelection({ quiet = false } = {}) {
    selected = null;
    showDetail(null);
    globe?.select(null);
    if (!quiet) onRoute?.(null);
  }
  /** Open on an id (a report or a place), or ignore one that isn't there. */
  const focusOn = (id) => {
    if (!id) return false;
    if (reportById.has(id)) return choose(`report:${id}`);
    if (placeById.has(id)) return choose(`place:${id}`);
    return false;
  };

  // ── Closing ──
  function close({ silent = false } = {}) {
    if (closed) return;
    closed = true;
    clearTimeout(searchTimer);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    globe?.destroy();
    root.remove();
    document.body.classList.remove('moon-open');
    setBackgroundInert(false);
    open = null;
    if (!silent) lastFocus?.focus?.();
    onClose?.({ silent });
  }

  // ── Keys and clicks ──
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === searchEl && searchEl.value) {
        searchEl.value = '';
        mount(listEl, listHtml('', reports));
        return;
      }
      close();
      return;
    }
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const turn = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (turn && !e.target.closest?.('button, a, [role="radio"]')) {
      e.preventDefault();
      globe?.turn(...turn);
    } else if (e.key === '+' || e.key === '=') globe?.zoom(1.6);
    else if (e.key === '-' || e.key === '_') globe?.zoom(1 / 1.6);
    else if (e.key === '0') globe?.home();
    else if (e.key.toLowerCase() === 'n') toggleNames();
  }
  document.addEventListener('keydown', onKey, true);
  const onResize = () => {
    box = null;
    globe?.resize();
  };
  window.addEventListener('resize', onResize);

  let names = true;
  function toggleNames() {
    names = !names;
    globe?.setNames(names);
    const b = $('[data-moon="names"]');
    b.classList.toggle('on', names);
    b.setAttribute('aria-pressed', String(names));
  }

  root.addEventListener('click', (e) => {
    const item = e.target.closest('.moon-item');
    if (item) return void choose(item.dataset.key);
    const style = e.target.closest('[data-style]');
    if (style) {
      globe?.setStyle(style.dataset.style);
      for (const b of root.querySelectorAll('[data-style]')) {
        b.classList.toggle('on', b === style);
        b.setAttribute('aria-checked', String(b === style));
      }
      return;
    }
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
    const fly = e.target.closest('[data-fly]');
    if (fly) {
      const entry = reportById.get(selected?.id)?.entry;
      if (entry?.earth) {
        close({ silent: true });
        onFly?.(entry.earth);
      }
      return;
    }
    const act = e.target.closest('[data-moon]')?.dataset.moon;
    if (act === 'close') close();
    else if (act === 'home') globe?.home();
    else if (act === 'in') globe?.zoom(1.6);
    else if (act === 'out') globe?.zoom(1 / 1.6);
    else if (act === 'names') toggleNames();
    else if (act === 'all') clearSelection();
    else if (act === 'fold') {
      const folded = $('.moon-panel').classList.toggle('collapsed');
      root.classList.toggle('folded', folded);
      e.target.closest('button').setAttribute('aria-expanded', String(!folded));
      box = null;
      globe?.resize();
    }
  });

  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => mount(listEl, listHtml(searchEl.value, reports)), 120);
  });

  // ── The globe ──
  const posEl = $('#moon-pos');
  const altEl = $('#moon-alt');
  let tipText = '';
  const api = {
    focus: (id) => {
      if (!globe) pending = id;
      else if (!id) {
        clearSelection({ quiet: true });
        globe.home();
      } else focusOn(id);
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
      onView: ({ height }) => {
        altEl.textContent = ` · ALT ${Math.round(height / 1000).toLocaleString()} km`;
      },
      onPointer: (at) => {
        posEl.textContent = at ? fmtLatLon(at.lat, at.lon) : '—';
      },
      onOffline: () => toast('NASA’s detailed Moon pictures can’t be reached right now. Showing the low-resolution map.', 6000),
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
  globe.active = true;
  if (!focusOn(pending)) $('#moon-globe').focus();
  return api;
}

/** Close the map, if it is open. `silent` leaves the focus and the address to the caller. */
export function closeMoon(options) {
  open?.close(options);
}
