import { html, safeUrl } from '../util/dom.js';
import { t } from '../i18n/index.js';
import { STATUS } from '../data/taxonomy.js';
import { SPACE, SPACE_ZONES, NASA_UAP_URL } from '../data/space.js';
import { openModal, closeModal } from './modals.js';

/**
 * Space & Moon: reports from orbit, from the Moon and from deep space, in one
 * dialog with three tabs. The Moon tab plots lunar positions on a photograph
 * of the near side. The photograph is not a map projection, so the mapping
 * from latitude and longitude to the picture was fitted to known craters
 * (Tycho, Copernicus, Aristarchus, Kepler, Plato and Mare Crisium); it carries
 * the photograph's libration and tilt, and lands within about a degree.
 */
const ZONE_LABEL = { orbit: 'IN ORBIT', moon: 'THE MOON', deep: 'DEEP SPACE' };
const MOON_RADIUS = 0.4823; // of the picture's width
const MOON_ROTATION = [
  [0.95905404, 0.27029358, 0.08459741],
  [-0.27761825, 0.95628825, 0.09187435],
  [-0.05606646, -0.11159826, 0.99217054],
];

/**
 * Where a lunar position falls on the near-side picture, as fractions of its
 * width and height (0–1, from the top left), or null when it is on the far side.
 */
export function moonXY(lat, lon) {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const v = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  const w = MOON_ROTATION.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  if (w[2] < 0.03) return null;
  return { x: 0.5 + MOON_RADIUS * w[0], y: 0.5 - MOON_RADIUS * w[1] };
}

const statusBadge = (s) => html`<span class="badge status-${s}">${t(STATUS[s]?.label || s)}</span>`;

function card(e, { officialById, number }) {
  const files = (e.official || []).map((id) => officialById.get(String(id))).filter(Boolean); // the releases key their records by DVIDS id as text
  return html`<li class="space-card" id="sp-${e.id}" data-id="${e.id}">
    <div class="sc-head">${number ? html`<span class="sc-num" aria-hidden="true">${number}</span>` : ''}${statusBadge(e.status)}<span class="sc-when mono">${e.when}</span></div>
    <h3>${e.title}</h3>
    <div class="sc-where">${e.where}</div>
    <p>${e.summary}</p>
    <p class="sc-expl"><b>${t('WHAT IS KNOWN')}</b> ${e.explanation}</p>
    ${files.length
      ? html`<div class="sc-files"><b>${t('NASA FILES IN THE OFFICIAL RELEASES')}</b><ul>${files.map((f) => html`<li><a href="#/official/${f.dvidsId}">${f.title}</a></li>`)}</ul></div>`
      : ''}
    <ul class="sc-sources">${e.sources.map((s) => html`<li><span class="badge">${(s.kind || 'ref').toUpperCase()}</span><a href="${safeUrl(s.url)}" target="_blank" rel="noopener">${s.label}</a></li>`)}</ul>
    ${e.earth ? html`<div class="sc-actions"><button type="button" class="chip" data-fly="${e.id}">${t('SHOW ON THE GLOBE')} · ${e.earth.note}</button></div>` : ''}
  </li>`;
}

function moonMap(entries, base) {
  let n = 0;
  const pins = [];
  const numbers = new Map();
  for (const e of entries) {
    if (!e.moon?.length) continue;
    n += 1;
    numbers.set(e.id, n);
    for (const site of e.moon) {
      const at = moonXY(site.lat, site.lon);
      if (at) pins.push({ ...at, n, id: e.id, label: site.label, title: e.title });
    }
  }
  // Reports at the same place (Aristarchus has three) would hide each other, so
  // those pins fan out above a dot that marks the spot.
  const groups = [];
  for (const p of pins) {
    const g = groups.find((q) => Math.hypot(q[0].x - p.x, q[0].y - p.y) < 0.04);
    if (g) g.push(p);
    else groups.push([p]);
  }
  const placed = groups.flatMap((g) =>
    g.map((p, i) => ({ ...p, dx: g.length > 1 ? Math.round((i - (g.length - 1) / 2) * 25) : 0, dy: g.length > 1 ? -22 : 0, grouped: g.length > 1 })),
  );
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const map = html`<figure class="moon-map">
    <div class="moon-frame">
      <img src="${base}space/moon-near-side.jpg" alt="${t('The near side of the Moon, with the sites of these reports marked')}" width="880" height="880" />
      ${groups.filter((g) => g.length > 1).map((g) => html`<span class="moon-dot" style="left:${pct(g[0].x)};top:${pct(g[0].y)}" aria-hidden="true"></span>`)}
      ${placed.map((p) => html`<button type="button" class="moon-pin" data-pin="${p.id}" style="left:${pct(p.x)};top:${pct(p.y)};transform:translate(${p.dx}px,${p.dy}px)" aria-label="${p.n}. ${p.title} — ${p.label}" title="${p.label}">${p.n}</button>`)}
    </div>
    <figcaption>${t('Near side, north up, east to the right. Positions are approximate (within about a degree). Photograph: Gregory H. Revera, CC BY-SA 3.0, via Wikimedia Commons.')}</figcaption>
  </figure>`;
  return { map, numbers };
}

/**
 * @param {object} o
 * @param {string} o.base         the app's base URL, for the Moon picture
 * @param {Map}    o.officialById official releases by DVIDS id
 * @param {(earth: {lat: number, lon: number}) => void} o.onFly  fly the globe to a place
 * @param {string} [o.zone]       the tab to open on
 */
export function openSpace({ base, officialById, onFly, zone = 'orbit' }) {
  const tab = SPACE_ZONES.includes(zone) ? zone : 'orbit';
  const moonEntries = SPACE.filter((e) => e.zone === 'moon').sort((a, b) => a.year - b.year);
  const { map, numbers } = moonMap(moonEntries, base);
  const lists = Object.fromEntries(
    SPACE_ZONES.map((z) => [z, SPACE.filter((e) => e.zone === z).sort((a, b) => a.year - b.year)]),
  );
  const content = html`
    <h2>${t('Space & Moon')}</h2>
    <p class="lead">${t('Reports from beyond the atmosphere: what astronauts have described from orbit, what astronomers have seen on the Moon, and a few distant objects that are discussed as possible technology. Most have a natural explanation. Each entry says what was reported, what is documented and what the best explanation is.')}</p>
    <div class="space-tabs" role="tablist" aria-label="${t('Space & Moon')}">
      ${SPACE_ZONES.map(
        (z) => html`<button type="button" class="chip ${z === tab ? 'on' : ''}" role="tab" id="space-tab-${z}" data-zone="${z}" aria-selected="${z === tab ? 'true' : 'false'}" aria-controls="space-panel-${z}" tabindex="${z === tab ? '0' : '-1'}">${t(ZONE_LABEL[z])} · ${lists[z].length}</button>`,
      )}
    </div>
    ${SPACE_ZONES.map(
      (z) => html`<section class="space-panel" id="space-panel-${z}" role="tabpanel" aria-labelledby="space-tab-${z}" ${z === tab ? '' : 'hidden'}>
        ${z === 'moon' ? map : ''}
        <ol class="space-list">${lists[z].map((e) => card(e, { officialById, number: numbers.get(e.id) }))}</ol>
      </section>`,
    )}
    <p class="caveat">${t('NASA’s own look at the subject is at')} <a href="${NASA_UAP_URL}" target="_blank" rel="noopener">science.nasa.gov/uap</a>. ${t('The NASA files above are the ones released in the 2026 PURSUE releases; they play in the app like the other official records.')}</p>`;

  const el = openModal('SPACE & MOON', content);
  const show = (z, { focus = false } = {}) => {
    for (const b of el.querySelectorAll('[role="tab"]')) {
      const on = b.dataset.zone === z;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    for (const p of el.querySelectorAll('.space-panel')) p.hidden = p.id !== `space-panel-${z}`;
  };
  el.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[role="tab"]');
    if (tabBtn) return show(tabBtn.dataset.zone);
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      const target = el.querySelector(`#sp-${CSS.escape(pin.dataset.pin)}`);
      target?.scrollIntoView({ block: 'center', behavior: 'auto' });
      target?.classList.remove('flash');
      void target?.offsetWidth;
      target?.classList.add('flash');
      return;
    }
    const fly = e.target.closest('[data-fly]');
    if (fly) {
      const entry = SPACE.find((s) => s.id === fly.dataset.fly);
      if (entry?.earth) {
        closeModal();
        onFly(entry.earth);
      }
    }
  });
  el.addEventListener('keydown', (e) => {
    const tabBtn = e.target.closest?.('[role="tab"]');
    if (!tabBtn || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = SPACE_ZONES.indexOf(tabBtn.dataset.zone);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? SPACE_ZONES.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + SPACE_ZONES.length) % SPACE_ZONES.length;
    show(SPACE_ZONES[next], { focus: true });
  });
  return el;
}

