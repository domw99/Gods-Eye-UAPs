import { html, mount } from '../util/dom.js';
import { EVIDENCE, STATUS, SHAPES, evidenceScore } from '../data/taxonomy.js';
import { state, update, toggleIn, setLayer, filtersActive, resetFilters, DEFAULT_LAYERS } from '../state.js';
import { itemColor } from '../layers/items.js';

/** Left rail: search, layer toggles, evidence/status filters and results. */
export const LAYER_DEFS = [
  { id: 'cases', name: 'Case files', sub: 'Curated encounters with reconstructed paths', color: '#00d4ff' },
  { id: 'official', name: 'Official U.S. footage', sub: 'PURSUE / AARO releases via DVIDS', color: '#ff5ce1' },
  { id: 'bluebook', name: 'Project Blue Book', sub: 'USAF case files 1947–1969 (scans)', color: '#ffb547' },
  { id: 'geipan', name: 'GEIPAN (France)', sub: 'French space agency files 1937–2018 · A–D findings', color: '#5f8bff' },
  { id: 'mufon', name: 'MUFON files', sub: 'MUFON UFO Journal 1967–2008 · places named', color: '#b58cff' },
  { id: 'journals', name: 'Research archives', sub: 'APRO, NICAP & CUFOS journals, MUFON chapters · places named', color: '#3fd4b0' },
  { id: 'nuforc', name: 'Civilian reports', sub: 'NUFORC, ~80k unverified reports', color: '#ff7a45' },
  { id: 'satellites', name: 'Live satellites', sub: 'Starlink, ISS & bright satellites now', color: '#7dd3ff' },
  { id: 'launches', name: 'Rocket launches', sub: 'Last 14 days and next 30 · Launch Library 2', color: '#ffcf5c' },
  { id: 'airspace', name: 'Military airspace', sub: 'U.S. restricted, warning & training areas (FAA)', color: '#ff9f1c' },
  { id: 'buildings', name: '3D buildings', sub: 'OpenStreetMap, no key needed · zoom into a city', color: '#b7c2ce' },
  { id: 'user', name: 'My sightings', sub: 'Stored only in this browser', color: '#c6ff5c' },
];

const EVIDENCE_FILTERS = [
  'video', 'photo', 'radar', 'sensor-data', 'official-document', 'military-witness',
  'pilot-witness', 'police-witness', 'multiple-witnesses', 'physical-trace', 'medical', 'audio', 'em-effects',
];

const layersAreDefault = () => Object.entries(DEFAULT_LAYERS).every(([k, v]) => Boolean(state.layers[k]) === v);

export function renderLayers(counts) {
  document.getElementById('layers-reset')?.classList.toggle('hidden', layersAreDefault());
  mount(
    document.getElementById('layers'),
    html`${LAYER_DEFS.map(
      (l) => html`<button class="layer" data-layer="${l.id}" aria-pressed="${state.layers[l.id] ? 'true' : 'false'}" style="color:${l.color}">
        <span class="swatch"></span>
        <span style="color:var(--text-primary)"><span class="name">${l.name}</span><span class="sub">${l.sub}</span></span>
        <span class="state">${counts[l.id] ?? ''}</span>
      </button>`,
    )}`,
  );
}

/** The filters in force, each removable, with one button to clear them all. */
export function renderActiveFilters() {
  const el = document.getElementById('active-filters');
  if (!el) return;
  const chips = [];
  if (state.search) chips.push(html`<button class="chip small on" data-clear="search" title="Clear the search">“${state.search}” ✕</button>`);
  if (state.yearRange) chips.push(html`<button class="chip small on" data-clear="years" title="All years">${state.yearRange[0]}–${state.yearRange[1]} ✕</button>`);
  for (const e of state.evidence) chips.push(html`<button class="chip small on" data-clear-evidence="${e}">${EVIDENCE[e]?.label || e} ✕</button>`);
  for (const k of state.shape) chips.push(html`<button class="chip small on" data-clear-shape="${k}">${SHAPES[k]?.label || k} ✕</button>`);
  for (const k of state.status) chips.push(html`<button class="chip small on" data-clear-status="${k}">${STATUS[k]?.label || k} ✕</button>`);
  el.classList.toggle('hidden', !chips.length);
  mount(el, chips.length ? html`<span class="af-label">FILTERED BY</span>${chips}<button class="chip small af-reset" data-clear="all">RESET ALL</button>` : html``);
}

export function renderFilters() {
  const n = state.evidence.size + state.status.size + state.shape.size;
  document.getElementById('filter-count').textContent = n ? `· ${n} ACTIVE` : '';
  mount(
    document.getElementById('evidence-filters'),
    html`${EVIDENCE_FILTERS.map(
      (e) => html`<button class="chip small ${state.evidence.has(e) ? 'on' : ''}" data-evidence="${e}" title="${EVIDENCE[e].long}">${EVIDENCE[e].label}</button>`,
    )}`,
  );
  mount(
    document.getElementById('shape-filters'),
    html`${Object.entries(SHAPES).map(
      ([k, s]) => html`<button class="chip small ${state.shape.has(k) ? 'on' : ''}" data-shape="${k}">${s.label}</button>`,
    )}`,
  );
  mount(
    document.getElementById('status-filters'),
    html`${Object.entries(STATUS).map(
      ([k, s]) => html`<button class="chip small ${state.status.has(k) ? 'on' : ''}" data-status="${k}" title="${s.long}">${s.label}</button>`,
    )}`,
  );
}

const SORTERS = {
  'date-desc': (a, b) => b.date - a.date,
  'date-asc': (a, b) => a.date - b.date,
  evidence: (a, b) => evidenceScore(b.evidence, b.hasTrack) - evidenceScore(a.evidence, a.hasTrack) || b.date - a.date,
  name: (a, b) => a.title.localeCompare(b.title),
};

export function renderList(items) {
  const sorted = [...items].sort(SORTERS[state.sort] || SORTERS['date-desc']);
  const list = document.getElementById('case-list');
  document.getElementById('case-count').textContent = `${items.length} shown`;
  if (!sorted.length) {
    mount(
      list,
      html`<li class="case-empty">No records match these filters.${filtersActive() ? html`<br /><button class="chip small on" data-clear="all" style="margin-top:10px">RESET FILTERS</button>` : ''}</li>`,
    );
    return;
  }
  mount(
    list,
    html`${sorted.map((it) => {
      const y = it.date.getUTCFullYear();
      const badges = [];
      if (it.kind === 'official') badges.push(html`<span class="badge official">OFFICIAL</span>`);
      if (it.kind === 'user') badges.push(html`<span class="badge" style="color:#c6ff5c">MINE</span>`);
      badges.push(html`<span class="badge status-${it.status}">${STATUS[it.status]?.label || ''}</span>`);
      if (it.hasTrack) badges.push(html`<span class="badge path">FLIGHT PATH</span>`);
      if (it.kind === 'case' && it.evidence.some((e) => e === 'video' || e === 'film')) badges.push(html`<span class="badge">VIDEO</span>`);
      if (it.lat == null) badges.push(html`<span class="badge">NO LOCATION</span>`);
      return html`<li class="case-item" role="option" tabindex="0" data-key="${it.key}" aria-selected="${state.selected === it.key ? 'true' : 'false'}">
        <span class="dot" style="background:${itemColor(it)};box-shadow:0 0 8px ${itemColor(it)}"></span>
        <div><div class="t">${it.title}</div><div class="m">${y} · ${it.place}</div><div class="b">${badges}</div></div>
      </li>`;
    })}`,
  );
}

export function markSelected(key) {
  for (const li of document.querySelectorAll('#case-list .case-item'))
    li.setAttribute('aria-selected', li.dataset.key === key ? 'true' : 'false');
  const el = key && document.querySelector(`#case-list [data-key="${CSS.escape(key)}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}

export function bindList({ onSelect }) {
  const search = document.getElementById('search');
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => update({ search: search.value.trim().toLowerCase() }, 'search'), 120);
  });
  document.getElementById('sort').addEventListener('change', (e) => update({ sort: e.target.value }, 'sort'));
  document.getElementById('layers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layer]');
    if (b) setLayer(b.dataset.layer, !state.layers[b.dataset.layer]);
  });
  document.getElementById('evidence-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-evidence]');
    if (b) toggleIn('evidence', b.dataset.evidence);
  });
  document.getElementById('shape-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-shape]');
    if (b) toggleIn('shape', b.dataset.shape);
  });
  document.getElementById('status-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (b) toggleIn('status', b.dataset.status);
  });
  // Removing filters: the chips above the results, and the reset in an empty list.
  const clear = (e) => {
    const b = e.target.closest('[data-clear], [data-clear-evidence], [data-clear-shape], [data-clear-status]');
    if (!b) return false;
    if (b.dataset.clear === 'all') resetFilters();
    else if (b.dataset.clear === 'search') {
      search.value = '';
      update({ search: '' }, 'search');
    } else if (b.dataset.clear === 'years') update({ yearRange: null }, 'yearRange');
    else if (b.dataset.clearEvidence) toggleIn('evidence', b.dataset.clearEvidence);
    else if (b.dataset.clearShape) toggleIn('shape', b.dataset.clearShape);
    else if (b.dataset.clearStatus) toggleIn('status', b.dataset.clearStatus);
    return true;
  };
  document.getElementById('active-filters')?.addEventListener('click', clear);
  document.getElementById('layers-reset')?.addEventListener('click', () => update({ layers: { ...DEFAULT_LAYERS } }, 'layers'));
  const list = document.getElementById('case-list');
  list.addEventListener('click', (e) => {
    if (clear(e)) return;
    const li = e.target.closest('[data-key]');
    if (li) onSelect(li.dataset.key, 'list');
  });
  list.addEventListener('keydown', (e) => {
    const li = e.target.closest('[data-key]');
    if (!li) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(li.dataset.key, 'list');
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      (e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling)?.focus();
    }
  });
  document.getElementById('left-collapse').addEventListener('click', () => {
    const left = document.getElementById('left');
    left.classList.toggle('collapsed');
    document.body.classList.toggle('left-collapsed', left.classList.contains('collapsed'));
  });
}
