import { html, raw, mount, esc, safeUrl, toast } from '../util/dom.js';
import { EVIDENCE, STATUS, CATEGORY, TRACK_KINDS, TRACK_BASIS, PRECISION, evidenceScore } from '../data/taxonomy.js';
import { formatDMS, formatDuration, haversineKm } from '../util/geo.js';
import { trackStats } from '../layers/tracks.js';
import { wikiSummary, commonsFiles, commonsPage } from '../services/wiki.js';
import { skyAt, bodiesNamedIn, compass } from '../services/sky.js';
import { weatherAt, weatherAvailable, describeWeatherCode, driftToward, trackVsWind } from '../services/weather.js';
import { launchesNear, cachedLaunchesNear, RateLimitError } from '../services/launches.js';
import { skySection } from './skychart.js';
import { AIRSPACE_TYPES, formatFt, nearUS } from '../services/airspace.js';
import { correctionUrl, REPO_URL } from '../config.js';
import { shareLink } from '../app/links.js';
import { relativeTime } from '../layers/launches.js';
import { issueDate, issueLabel, pageNumber, readerUrl, embedUrl, pdfUrl, itemUrl, pageText, MUFON_LICENSE } from '../services/mufon.js';
import { SERIES_SHORT, SERIES_LINKS } from '../services/journals.js';
import { classInfo, geipanDate, caseUrl, translateUrl, bodiesNamed, GEIPAN_SITE, GEIPAN_SEARCH, CLASS_COLORS } from '../services/geipan.js';

/**
 * Right-hand dossier. One renderer per record type; async sections (Commons
 * media, Wikipedia, Blue Book and MUFON matches) fill in after the
 * static part is on screen.
 */
const panel = () => document.getElementById('dossier');
const body = () => document.getElementById('dossier-body');
let renderToken = 0;

/**
 * Wait a moment before calling remote services, and skip the call if another
 * record has been opened meanwhile. Stepping quickly through cases ([ ], the
 * tour) otherwise fires a burst of requests that rate limits then refuse.
 */
async function settle(token, ms = 350) {
  await new Promise((r) => setTimeout(r, ms));
  return token === renderToken;
}

const fmtDate = (d, opts = {}) =>
  d.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', ...opts });

/** "13 Mar 1997, 19:55 local (UTC−07:00) · 02:55 UTC" from an ISO string with offset. */
function localAndUtc(iso, approx = false) {
  if (approx) return `${localAndUtc(iso).replace(/(\d{2}:\d{2}) local/, '~$1 local').replace(/ · \d{2}:\d{2} UTC$/, '')} · time of day approximate`;
  const d = new Date(iso);
  const m = iso.match(/T(\d{2}):(\d{2}).*([+-]\d{2}):?(\d{2})$/);
  const utc = `${d.toISOString().slice(11, 16)} UTC`;
  if (!m) return `${fmtDate(d, { timeZone: 'UTC' })} · ${utc}`;
  const offMin = (m[3].startsWith('-') ? -1 : 1) * (Math.abs(+m[3]) * 60 + +m[4]);
  const local = new Date(d.getTime() + offMin * 60000);
  const day = fmtDate(local, { timeZone: 'UTC' });
  const off = `UTC${offMin < 0 ? '−' : '+'}${m[3].replace(/^[+-]/, '')}:${m[4]}`;
  return `${day}, ${m[1]}:${m[2]} local (${off}) · ${utc}`;
}

function statusBadge(status) {
  const s = STATUS[status] || STATUS.unassessed;
  return html`<span class="badge status-${status}" title="${s.long}">${s.label}</span>`;
}
const evidenceBadges = (list = []) =>
  list.map((e) => html`<span class="badge" title="${EVIDENCE[e]?.long || e}">${EVIDENCE[e]?.label || e}</span>`);

function siteLinks(lat, lon) {
  const ll = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return html`<div class="site-links">
    <a class="chip" target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=map&center=${ll}&zoom=15&basemap=satellite">Google satellite ↗</a>
    <a class="chip" target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}">Street View ↗</a>
    <a class="chip" target="_blank" rel="noopener" href="https://earth.google.com/web/@${lat},${lon},0a,3000d,35y,0h,60t,0r">Google Earth 3D ↗</a>
    <a class="chip" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}">OpenStreetMap ↗</a>
  </div>`;
}

/* ── Sky and launch context shared by cases and user sightings ── */
function skyBlock(lat, lon, when, explanation = '', approx = false) {
  try {
    const sky = skyAt(lat, lon, when);
    const year = new Date(when).getUTCFullYear();
    const notes = [];
    if (approx) notes.push('— but the sources give no exact time of day for this case, so treat the chart as indicative');
    if (year < 1583) notes.push('(dates before 1583 are read as Gregorian, so allow for the calendar change)');
    const note = notes.join(' ');
    return skySection(sky, bodiesNamedIn(explanation), { note });
  } catch (error) {
    console.warn('[sky]', error);
    return html`<p class="caveat">Sky positions could not be computed for this date.</p>`;
  }
}

function weatherBlock(when) {
  if (!weatherAvailable(when)) return '';
  return section('WEATHER AT THE TIME', html`<div id="d-weather"><div class="loading-line">Loading historical weather…</div></div>`);
}

function windArrow(towardDeg) {
  return raw(`<svg class="wind-arrow" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" /><text x="20" y="8" text-anchor="middle">N</text>
    <g transform="rotate(${towardDeg.toFixed(0)} 20 20)"><line x1="20" y1="30" x2="20" y2="11" /><path d="M20 8 L25 16 L15 16 Z" /></g></svg>`);
}

const windLine = (speed, from) =>
  speed == null || from == null
    ? '—'
    : `${Math.round(speed)} km/h from the ${compass(from)} (blowing toward the ${compass(driftToward(from))})`;

async function fillWeather(token, lat, lon, when, uapTrack, approx = false) {
  const el = document.getElementById('d-weather');
  if (!el || !(await settle(token))) return;
  let wx;
  try {
    wx = await weatherAt(lat, lon, when);
  } catch (error) {
    console.warn('[weather]', error);
  }
  if (token !== renderToken || !document.getElementById('d-weather')) return;
  if (!wx) {
    mount(el, html`<p class="caveat">No weather record could be loaded for this time.</p>`);
    return;
  }
  const cmp = trackVsWind(uapTrack, wx);
  const from = wx.wind_direction_100m ?? wx.wind_direction_10m;
  const verdict = {
    'with-wind': `The reconstructed path runs with the wind (heading ${compass(cmp?.heading ?? 0)} at about ${Math.round(cmp?.speed ?? 0)} km/h). That fits something drifting, like a balloon or lantern, though the path is itself a reconstruction.`,
    'against-wind': `The reconstructed path runs against the wind (heading ${compass(cmp?.heading ?? 0)}), so simple drifting doesn't explain it.`,
    'across-wind': `The reconstructed path (heading ${compass(cmp?.heading ?? 0)}) doesn't follow the wind.`,
    fast: `The reconstructed path is far faster than the wind (about ${Math.round(cmp?.speed ?? 0).toLocaleString()} km/h), so wind drift doesn't apply.`,
  }[cmp?.verdict];
  mount(
    el,
    html`<div class="wx-wrap">
        ${from != null ? windArrow(driftToward(from)) : ''}
        <dl class="d-kv">
          <dt>SKY</dt><dd>${describeWeatherCode(wx.weather_code)}${wx.cloud_cover != null ? html` · cloud ${wx.cloud_cover}% <span class="dim">(low ${wx.cloud_cover_low ?? '—'} · mid ${wx.cloud_cover_mid ?? '—'} · high ${wx.cloud_cover_high ?? '—'})</span>` : ''}</dd>
          <dt>WIND 10 M</dt><dd>${windLine(wx.wind_speed_10m, wx.wind_direction_10m)}${wx.wind_gusts_10m ? html` <span class="dim">· gusts ${Math.round(wx.wind_gusts_10m)}</span>` : ''}</dd>
          <dt>WIND 100 M</dt><dd>${windLine(wx.wind_speed_100m, wx.wind_direction_100m)}</dd>
          <dt>TEMP</dt><dd>${wx.temperature_2m != null ? `${Math.round(wx.temperature_2m)} °C` : '—'}${wx.precipitation ? ` · ${wx.precipitation} mm precipitation` : ''}</dd>
        </dl>
      </div>
      ${verdict ? html`<p class="d-text wx-verdict">${verdict}</p>` : ''}
      <p class="caveat">${wx.source}, hour of ${wx.hour.slice(0, 13).replace('T', ' ')}:00 UTC, on a ~25 km grid.${approx ? ' The time of day for this case is approximate, so conditions at the real moment may differ.' : ''} Local conditions can differ, and winds aloft are often stronger and from a different direction.</p>`,
  );
}

function launchBlock(lat, lon, when) {
  if (new Date(when).getUTCFullYear() < 1957) return '';
  return section(
    'ROCKET LAUNCHES AROUND THE TIME',
    html`<div id="d-launches" data-when="${new Date(when).toISOString()}" data-lat="${lat}" data-lon="${lon}">
      <p class="d-text">Launch plumes at dusk and dawn, stage separations and re-entries are seen hundreds of kilometres away and cause many modern reports.</p>
      <div class="btn-row"><button class="chip" data-action="launch-check">CHECK LAUNCHES ±12 H</button></div></div>`,
  );
}

const fmtGap = (ms) => {
  const m = Math.round(Math.abs(ms) / 60000);
  const s = m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
  return ms < 0 ? `${s} before` : `${s} after`;
};

async function fillLaunches(el) {
  const when = el.dataset.when;
  const lat = Number(el.dataset.lat);
  const lon = Number(el.dataset.lon);
  mount(el, html`<div class="loading-line">Asking Launch Library 2…</div>`);
  let list;
  try {
    list = await launchesNear(when, 12);
  } catch (error) {
    mount(
      el,
      html`<p class="caveat">${error instanceof RateLimitError ? 'Launch Library allows about 15 look-ups an hour without a key. Try again later.' : 'Launch Library could not be reached.'}</p>
        <div class="btn-row"><button class="chip" data-action="launch-check">TRY AGAIN</button></div>`,
    );
    return;
  }
  showLaunches(el, list, when, lat, lon);
}

function showLaunches(el, list, when, lat, lon) {
  const t = Date.parse(when);
  const rows = list
    .map((l) => ({ ...l, gap: Date.parse(l.net) - t, km: l.lat != null ? haversineKm(lat, lon, l.lat, l.lon) : null }))
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  mount(
    el,
    rows.length
      ? html`<ul class="source-list launch-list">${rows.map(
          (l) => html`<li class="${l.km != null && l.km < 2000 ? 'near' : ''}"><span class="badge ${l.km != null && l.km < 2000 ? 'official' : ''}">${fmtGap(l.gap)}</span>
            <span><b>${l.name}</b><br /><span class="dim">${l.location || l.pad}${l.km != null ? ` · ${Math.round(l.km).toLocaleString()} km away` : ''} · ${l.statusName || l.status}</span></span></li>`,
        )}</ul>
        <p class="caveat">Launches within 12 hours, nearest in time first; highlighted ones were under 2,000 km away. Source: Launch Library 2 (orbital and many suborbital launches; not military missile tests).</p>`
      : html`<p class="d-text">No launches are logged within 12 hours of this moment.</p><p class="caveat">Launch Library 2 covers orbital and many suborbital launches, not military missile tests.</p>`,
  );
}

function autoFillLaunches() {
  const el = document.getElementById('d-launches');
  if (!el) return;
  const cached = cachedLaunchesNear(el.dataset.when, 12);
  if (cached) showLaunches(el, cached, el.dataset.when, Number(el.dataset.lat), Number(el.dataset.lon));
}

const airspaceRow = (a, why) => html`<li><span class="badge" style="color:${AIRSPACE_TYPES[a.type]?.color}">${a.type}</span>
  <span><b>${a.name}</b> · ${AIRSPACE_TYPES[a.type]?.label || a.type}<br /><span class="dim">${formatFt(a.lowerFt)} to ${formatFt(a.upperFt)}${a.city ? ` · ${a.city}${a.state ? `, ${a.state}` : ''}` : ''}${a.timesOfUse ? ` · in use: ${a.timesOfUse.toLowerCase()}` : ''}${why && why !== 'location' ? ` · crossed by: ${why}` : ''}</span></span></li>`;

async function fillAirspace(token, promise) {
  const el = document.getElementById('d-airspace');
  if (!el) return;
  let hits;
  try {
    hits = await promise;
  } catch {
    hits = null;
  }
  if (token !== renderToken || !document.getElementById('d-airspace')) return;
  if (!hits) return mount(el, html`<p class="caveat">Airspace data could not be loaded.</p>`);
  mount(
    el,
    hits.length
      ? html`<ul class="source-list">${hits.map((h) => airspaceRow(h.area, h.why))}</ul>
        <p class="caveat">Military training and test areas concentrate aircraft, drones, targets, flares and sensors, and AARO notes many reports come from them. Boundaries are the FAA's current ones and may differ from the time of the case. Turn on the Military airspace layer to see them in 3D.</p>`
      : html`<p class="d-text">Not inside any current U.S. special-use airspace.</p>`,
  );
}

export function renderAirspace(a) {
  open('AIRSPACE');
  mount(
    body(),
    html`<div class="d-title">${a.name}</div>
    <div class="d-sub">${AIRSPACE_TYPES[a.type]?.label || a.type}${a.city ? ` · ${a.city}${a.state ? `, ${a.state}` : ''}` : ''}</div>
    ${section(
      'LIMITS',
      html`<dl class="d-kv"><dt>FLOOR</dt><dd>${formatFt(a.lowerFt)}</dd><dt>CEILING</dt><dd>${formatFt(a.upperFt)}</dd><dt>IN USE</dt><dd>${a.timesOfUse || '—'}</dd><dt>CONTROL</dt><dd>${a.controller || '—'}</dd></dl>`,
    )}
    ${section(
      'WHAT IT MEANS',
      html`<div class="d-text"><p>${{
        R: 'Restricted areas hold hazardous activity such as live firing, missile tests and guided weapons. Other aircraft need permission to enter while they are active.',
        W: 'Warning areas lie over international waters, beyond 3 nautical miles from the coast. They hold the same kind of hazardous military activity as restricted areas: carrier air wings train here.',
        MOA: 'Military operations areas separate military training (combat manoeuvres, aerobatics, intercepts) from other traffic.',
        A: 'Alert areas warn of a high volume of pilot training or unusual activity.',
        P: 'Prohibited areas are closed to aircraft, for security (for example over the White House).',
        D: 'Danger areas hold activities dangerous to aircraft at specified times.',
      }[a.type] || ''}</p></div>
      <p class="caveat">Data: FAA Aeronautical Information Services, special-use airspace (current boundaries).</p>`,
    )}`,
  );
}

export function renderLaunchPad(p) {
  open('LAUNCH SITE');
  const now = Date.now();
  mount(
    body(),
    html`<div class="d-title">${p.location || p.pad}</div>
    <div class="d-sub">${p.pad}<br />${formatDMS(p.lat, p.lon)}</div>
    ${section(
      'LAUNCHES (LAST 14 DAYS · NEXT 30)',
      html`<ul class="source-list launch-list">${p.launches.map(
        (l) => html`<li class="${Date.parse(l.net) >= now ? 'near' : ''}"><span class="badge ${Date.parse(l.net) >= now ? 'official' : ''}">${relativeTime(l.net, now)}</span>
          <span><b>${l.name}</b><br /><span class="dim">${fmtDate(new Date(l.net), { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })} · ${l.statusName || l.status}${l.orbit ? ` · ${l.orbit}` : ''}</span>
          ${l.description ? html`<br /><span class="dim" style="font-size:11.5px">${l.description}</span>` : ''}</span></li>`,
      )}</ul>`,
    )}
    ${section(
      'WHY IT MATTERS',
      html`<div class="d-text"><p>Launches shortly after sunset or before sunrise light up their exhaust plumes in sunlight high above a dark sky. The glowing "jellyfish" can be seen hundreds of kilometres away and is regularly reported as a UFO. Stage separations, fuel dumps and re-entering debris do the same.</p></div>
        <p class="caveat">Data: Launch Library 2 by The Space Devs. Times are the scheduled "no earlier than" time and can slip.</p>`,
    )}
    ${section('THE LOCATION', siteLinks(p.lat, p.lon))}`,
  );
}

function strengthMeter(score) {
  const cells = Array.from({ length: 10 }, (_, i) => `<i class="${i < score ? 'on' : ''}"></i>`).join('');
  return html`<span class="meter" title="Documentation score ${score}/10: instrument data, imagery, official papers and trained observers count most. It measures evidence, not strangeness.">${raw(cells)}<b>${score}/10</b></span>`;
}

function section(title, content, id = '') {
  return html`<section class="d-section" ${raw(id ? `id="${esc(id)}"` : '')}><h3>${title}</h3>${content}</section>`;
}

function open(idLabel) {
  panel().classList.remove('hidden');
  document.body.classList.add('dossier-open');
  document.getElementById('dossier-id').textContent = idLabel;
  body().scrollTop = 0;
  return ++renderToken;
}

export function closeDossier() {
  renderToken++;
  panel().classList.add('hidden');
  panel().classList.remove('peek');
  document.body.classList.remove('dossier-open', 'dossier-peek');
  body().innerHTML = '';
}

/* ── Media ─────────────────────────────────────────────── */

function dvidsCard(item, caption) {
  if (!item) return '';
  // Percent-encode characters that could end a CSS url('…') token.
  const thumb = item.thumbnail ? safeUrl(item.thumbnail).replace(/['"()\s\\]/g, (c) => `%${c.charCodeAt(0).toString(16)}`) : '';
  if (item.type === 'image')
    return html`<figure class="media-card" data-lightbox="${thumb}" data-caption="${caption || item.title}" data-credit="DVIDS · U.S. Government (public domain)" data-href="${item.page}">
      <img src="${thumb}" alt="${caption || item.title}" loading="lazy" referrerpolicy="no-referrer" />
      <span class="badge official kind">OFFICIAL IMAGE</span>
      <figcaption>${caption || item.title}</figcaption></figure>`;
  return html`<div class="video-wrap" data-dvids="${item.dvidsId}">
      <button class="dvids-play" aria-label="Play official video: ${item.title}" style="position:absolute;inset:0;display:grid;place-items:center;background:#000 url('${raw(esc(thumb))}') center/cover">
        <span class="chip" style="background:rgba(0,0,0,.65)">▶ PLAY OFFICIAL VIDEO</span>
      </button>
    </div>
    <div class="video-meta"><b>${caption || item.title}</b><br />${item.releaseId ? `${item.releaseId} · ` : ''}${item.duration || ''} · <a href="${safeUrl(item.page)}" target="_blank" rel="noopener">DVIDS page ↗</a></div>`;
}

function commonsBlock(info, caption) {
  if (!info) return html`<div class="loading-line">File unavailable: ${caption || ''}</div>`;
  const credit = [info.artist, info.license].filter(Boolean).join(' · ');
  if (/^video\//.test(info.mime))
    return html`<div class="video-wrap"><video controls preload="none" playsinline poster="${safeUrl(info.thumb)}" src="${safeUrl(info.url)}"></video></div>
      <div class="video-meta"><b>${caption || info.title}</b><br />${credit} · <a href="${safeUrl(info.page)}" target="_blank" rel="noopener">Wikimedia Commons ↗</a></div>`;
  if (/^audio\//.test(info.mime) || /\.(ogg|oga|opus|mp3)$/i.test(info.title))
    return html`<div class="video-meta"><b>${caption || info.title}</b></div><audio controls preload="none" src="${safeUrl(info.url)}" style="width:100%"></audio>
      <div class="video-meta">${credit} · <a href="${safeUrl(info.page)}" target="_blank" rel="noopener">Commons ↗</a></div>`;
  return null;
}

function imageCard(info, caption, page = null) {
  const credit = [info.artist, info.license].filter(Boolean).join(' · ');
  const pdf = info.mime === 'application/pdf';
  // A PDF shows one page: the chosen one, rendered by Commons (larger in the lightbox).
  const thumb = pdf && page ? info.thumb.replace(/\/page\d+-/, `/page${page}-`) : info.thumb;
  const big = pdf ? thumb.replace(/-\d+px-/, '-1280px-') : info.url;
  const href = pdf && page ? `${info.page}?page=${page}` : info.page;
  return html`<figure class="media-card" data-lightbox="${safeUrl(big)}" data-caption="${caption || info.description || info.title}" data-credit="${credit}" data-href="${safeUrl(href)}">
    <img src="${safeUrl(thumb)}" alt="${caption || info.title}" loading="lazy" />
    ${info.mime === 'application/pdf' ? html`<span class="badge kind">PDF</span>` : ''}
    <figcaption>${caption || info.title.replace(/^File:/, '')}</figcaption>
  </figure>`;
}

async function fillMedia(token, container, media, officialById) {
  if (!(await settle(token))) return;
  const commonsTitles = media.filter((m) => m.commons).map((m) => m.commons);
  let infos = new Map();
  try {
    infos = await commonsFiles(commonsTitles);
  } catch (e) {
    console.warn(e);
  }
  if (token !== renderToken) return;
  const players = [];
  const images = [];
  for (const m of media) {
    if (m.dvids) {
      const item = officialById.get(m.dvids);
      (item?.type === 'image' ? images : players).push(dvidsCard(item, m.caption));
    } else if (m.commons) {
      const info = infos.get(m.commons);
      const block = info && commonsBlock(info, m.caption);
      if (block) players.push(block);
      else if (info) images.push(imageCard(info, m.caption, m.page));
      else players.push(html`<div class="loading-line">Could not load ${m.commons}</div>`);
    }
  }
  mount(
    container,
    html`${players}${images.length ? html`<div class="media-grid ${images.length === 1 ? 'one' : ''}">${images}</div>` : ''}${
      !players.length && !images.length ? html`<div class="loading-line">No archived media for this case.</div>` : ''
    }`,
  );
  // Commons renders a PDF page the first time it is asked for, and that first
  // request can fail; try each image once more.
  for (const img of container.querySelectorAll('.media-card img'))
    img.addEventListener('error', () => {
      if (img.dataset.retried) return;
      img.dataset.retried = '1';
      setTimeout(() => (img.src = `${img.src}${img.src.includes('?') ? '&' : '?'}retry=1`), 2500);
    });
}

async function fillWiki(token, container, title) {
  if (!(await settle(token))) return;
  try {
    const s = await wikiSummary(title.split('#')[0]);
    if (token !== renderToken) return;
    mount(
      container,
      html`<a class="wiki-card" href="${safeUrl(s.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
        ${s.thumbnail ? html`<img src="${safeUrl(s.thumbnail)}" alt="" loading="lazy" />` : html`<span></span>`}
        <div><div style="font-weight:600;margin-bottom:4px">${s.title} <span class="dim">· Wikipedia ↗</span></div><p>${s.extract}</p></div>
      </a>`,
    );
  } catch {
    mount(container, html`<div class="loading-line">Wikipedia summary unavailable.</div>`);
  }
}

function bluebookList(records) {
  if (!records.length) return html`<div class="loading-line">No matching Blue Book files.</div>`;
  return html`<ul class="source-list">${records.map(
    (r) => html`<li><span class="badge">USAF</span><span><a href="#/bluebook/${encodeURIComponent(r.id)}">${r.place}</a> · ${r.year}${r.month ? `-${String(r.month).padStart(2, '0')}` : ''}${r.distKm != null ? ` · ${Math.round(r.distKm)} km away` : ''}
      <a class="dim" href="https://archive.org/details/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">archive ↗</a></span></li>`,
  )}</ul>`;
}

/** France and the overseas territories GEIPAN covers. */
const FRENCH = new Set(['FR', 'GP', 'MQ', 'GF', 'RE', 'YT', 'NC', 'PF', 'PM', 'WF', 'MC']);

function classBadge(cls) {
  const info = classInfo(cls);
  return html`<span class="badge geipan" style="color:${CLASS_COLORS[cls] || '#5f8bff'}" title="${info.long}">CLASS ${cls || '?'}</span>`;
}

function geipanList(records) {
  if (!records.length) return html`<div class="loading-line">No GEIPAN file matches this case.</div>`;
  return html`<ul class="source-list">${records.map(
    (r) => html`<li>${classBadge(r.cls)}<span><a href="#/geipan/${encodeURIComponent(r.id)}">${r.place}</a> · ${geipanDate(r)}${
      r.distKm != null ? ` · ${Math.round(r.distKm)} km away` : ''
    }<span class="mufon-quote" lang="fr">${r.short}</span></span></li>`,
  )}</ul>`;
}

/* ── Renderers ─────────────────────────────────────────── */

export function renderCase(item, ctx) {
  const c = item.ref;
  const token = open(c.id);
  const date = new Date(c.date);
  const tracks = c.tracks || [];
  const content = html`
    <div class="d-title">${c.title}</div>
    <div class="d-sub">${localAndUtc(c.date, c.timeApprox)}<br />${c.place}<br />
      ${formatDMS(c.lat, c.lon)} · <span title="${PRECISION[c.precision]}">${(c.precision || '').toUpperCase()}</span></div>
    <div class="d-badges">${statusBadge(c.status)}<span class="badge">${CATEGORY[c.category] || c.category}</span>${
      tracks.length ? html`<span class="badge path">${tracks.length} TRACK${tracks.length > 1 ? 'S' : ''}</span>` : ''
    }${evidenceBadges(c.evidence)}</div>

    <div class="btn-row" style="margin:10px 0 0"><button class="chip on" data-action="story">▶ STORY MODE</button><button class="chip" data-action="compare">⇄ COMPARE</button><button class="chip" data-action="share-card" title="An image of this case to post or send">⇪ SHARE</button></div>
    ${section('ASSESSMENT', html`<div class="explain"><b>${STATUS[c.status]?.label}</b>${c.explanation || STATUS[c.status]?.long}</div>`)}
    ${section('SUMMARY', html`<div class="d-text"><p>${c.summary}</p></div>
      <dl class="d-kv" style="margin-top:10px">
        <dt>SHAPE</dt><dd>${c.shape || '—'}</dd>
        <dt>WITNESSES</dt><dd>${c.witnesses || '—'}</dd>
        <dt>DURATION</dt><dd>${c.duration || '—'}</dd>
        <dt>COUNTRY</dt><dd>${c.country}</dd>
        <dt>EVIDENCE</dt><dd>${strengthMeter(evidenceScore(c.evidence, tracks.length > 0))}</dd>
      </dl>`)}

    ${tracks.length
      ? section(
          'FLIGHT PATH',
          html`<div class="track-list">${tracks.map((t) => {
            const st = trackStats(t);
            const kind = TRACK_KINDS[t.kind] || TRACK_KINDS.uap;
            return html`<div class="track"><span class="sw" style="background:${t.color || kind.color};box-shadow:0 0 8px ${t.color || kind.color}"></span>
              <span>${t.label}<br /><span class="dim" style="font-size:11px">${st.length.toFixed(st.length < 10 ? 1 : 0)} km · ${formatDuration(st.duration)} · max ${Math.round(st.maxAlt * 3.281).toLocaleString()} ft${
                st.avgSpeedKmh ? ` · avg ${Math.round(st.avgSpeedKmh).toLocaleString()} km/h` : ''
              }</span></span>
              <span class="basis">${(TRACK_BASIS[t.basis] || t.basis || '').toUpperCase()}</span></div>`;
          })}</div>
          <div class="btn-row"><button class="chip on" data-action="play">▶ PLAY PATH</button><button class="chip" data-action="chase">CHASE CAM</button><button class="chip" data-action="fit">FIT VIEW</button></div>
          <p class="caveat">Paths are reconstructed from the cited reports and are approximate; each track states its basis. Average speeds are simple distance ÷ time between reported points.</p>`,
        )
      : ''}

    ${c.timeline?.length
      ? section('TIMELINE', html`<ul class="timeline-list">${c.timeline.map((e) => html`<li><span class="when">${e.t}</span>${e.text}</li>`)}</ul>`)
      : ''}

    ${section('SKY AT THE TIME', skyBlock(c.lat, c.lon, c.date, c.explanation, c.timeApprox))}
    ${weatherBlock(c.date)}
    ${launchBlock(c.lat, c.lon, c.date)}
    ${nearUS(c.lat, c.lon) ? section('MILITARY AIRSPACE', html`<div id="d-airspace"><div class="loading-line">Checking FAA special-use airspace…</div></div>`) : ''}

    ${section('EVIDENCE & MEDIA', html`<div id="d-media"><div class="loading-line">Loading archived images and video…</div></div>`)}
    ${section('GOVERNMENT FILES — PROJECT BLUE BOOK', html`<div id="d-bluebook"><div class="loading-line">${
      date.getUTCFullYear() >= 1947 && date.getUTCFullYear() <= 1969 ? 'Searching Blue Book case files…' : 'Outside Blue Book’s 1947–1969 coverage.'
    }</div></div>`)}
    ${section('MUFON FILES — MUFON UFO JOURNAL', html`<div id="d-mufon"><div class="loading-line">${
      date.getUTCFullYear() <= 2008 ? 'Searching the MUFON UFO Journal (1967–2008)…' : 'After the journal archive ends (1967–2008).'
    }</div></div>`)}
    ${date.getUTCFullYear() <= 2011 ? section('RESEARCH ARCHIVES — APRO, NICAP, CUFOS', html`<div id="d-journals"><div class="loading-line">Searching the APRO, NICAP and CUFOS journals…</div></div>`) : ''}
    ${FRENCH.has(c.cc) ? section('FRENCH GOVERNMENT FILES — GEIPAN', html`<div id="d-geipan"><div class="loading-line">Searching GEIPAN’s case files…</div></div>`) : ''}
    ${c.wiki ? section('REFERENCE', html`<div id="d-wiki"><div class="loading-line">Loading Wikipedia…</div></div>`) : ''}
    ${section(
      'THE LOCATION',
      html`<div class="btn-row" style="margin:0 0 8px"><button class="chip" data-action="ground">⤓ FLY TO GROUND VIEW</button><button class="chip" data-action="share">⧉ COPY LINK</button><button class="chip" data-action="share-card">⇪ SHARE CARD</button></div>
        ${siteLinks(c.lat, c.lon)}`,
    )}
    ${section(
      'SOURCES',
      html`<ul class="source-list">
        ${c.wiki ? html`<li><span class="badge">WIKI</span><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(c.wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">${c.wiki}</a></li>` : ''}
        ${(c.sources || []).map((s) => html`<li><span class="badge ${s.kind === 'official' ? 'official' : ''}">${(s.kind || 'ref').toUpperCase()}</span><a href="${safeUrl(s.url)}" target="_blank" rel="noopener">${s.label}</a></li>`)}
        ${(c.media || []).filter((m) => m.commons).map((m) => html`<li><span class="badge">MEDIA</span><a href="${commonsPage(m.commons)}" target="_blank" rel="noopener">${m.caption || m.commons}</a></li>`)}
      </ul>
      <div class="btn-row"><a class="chip" href="${correctionUrl(c.id, c.title)}" target="_blank" rel="noopener">✎ SUGGEST A CORRECTION ↗</a><a class="chip" href="${REPO_URL}/issues/new?template=new-case.yml" target="_blank" rel="noopener">+ SUGGEST A CASE ↗</a></div>`,
    )}`;
  mount(body(), content);

  autoFillLaunches();
  fillWeather(token, c.lat, c.lon, c.date, tracks.find((t) => t.kind === 'uap'), c.timeApprox);
  if (nearUS(c.lat, c.lon) && ctx.airspaceFor) fillAirspace(token, ctx.airspaceFor(c));
  fillMedia(token, document.getElementById('d-media'), c.media || [], ctx.officialById);
  if (c.wiki) fillWiki(token, document.getElementById('d-wiki'), c.wiki);
  if (FRENCH.has(c.cc) && ctx.geipanFor)
    ctx
      .geipanFor(c)
      .then((list) => {
        if (token !== renderToken) return;
        mount(
          document.getElementById('d-geipan'),
          html`${geipanList(list)}<p class="caveat">Files from GEIPAN, the French space agency’s UAP office, within 40 km and three days of this case.</p>`,
        );
      })
      .catch(() => {
        if (token === renderToken) mount(document.getElementById('d-geipan'), html`<div class="loading-line">GEIPAN’s files could not be loaded.</div>`);
      });
  const year = date.getUTCFullYear();
  if (year <= 2011 && ctx.journalsFor)
    ctx
      .journalsFor(c)
      .then((m) => {
        if (token === renderToken) mount(document.getElementById('d-journals'), journalCaseBlock(m));
      })
      .catch(() => {
        if (token === renderToken) mount(document.getElementById('d-journals'), html`<div class="loading-line">The research archives could not be loaded.</div>`);
      });
  if (year <= 2008 && ctx.mufonFor)
    ctx
      .mufonFor(c)
      .then((m) => {
        if (token !== renderToken) return;
        mount(document.getElementById('d-mufon'), mufonCaseBlock(m));
      })
      .catch(() => {
        if (token === renderToken) mount(document.getElementById('d-mufon'), html`<div class="loading-line">The MUFON files could not be loaded.</div>`);
      });
  if (year >= 1947 && year <= 1969)
    ctx
      .bluebookNear(c, 150)
      .then((records) => {
        if (token !== renderToken) return;
        mount(
          document.getElementById('d-bluebook'),
          html`${bluebookList(records)}<p class="caveat">U.S. Air Force case files from the same month within 150 km, plus files linked to this case. Click to open the scanned file.</p>`,
        );
      })
      .catch(() => {
        if (token === renderToken) mount(document.getElementById('d-bluebook'), html`<div class="loading-line">Blue Book files could not be loaded.</div>`);
      });
}

export function renderOfficial(item, ctx) {
  const o = item.ref;
  const token = open(o.releaseId || `DVIDS ${o.dvidsId}`);
  const loc = o.location;
  const content = html`
    <div class="d-title">${o.title}</div>
    <div class="d-sub">${o.dateTaken ? `Taken ${o.dateTaken}` : ''}${o.datePosted ? ` · released ${o.datePosted}` : ''}<br />${o.agency}${o.duration ? ` · ${o.duration}` : ''}</div>
    <div class="d-badges">${statusBadge(item.status)}<span class="badge official">OFFICIAL U.S. RELEASE</span>${evidenceBadges(item.evidence)}</div>
    ${section('FOOTAGE', dvidsCard(o, o.title))}
    ${section('OFFICIAL DESCRIPTION', html`<div class="d-text" style="white-space:pre-line">${o.description}</div>`)}
    ${section(
      'LOCATION',
      loc
        ? html`<dl class="d-kv"><dt>AREA</dt><dd>${loc.name}</dd><dt>PRECISION</dt><dd>${PRECISION[loc.precision]}${loc.radiusKm ? ` (±${loc.radiusKm} km ring)` : ''}</dd></dl>
          ${loc.precision !== 'region' ? siteLinks(loc.lat, loc.lon) : html`<p class="caveat">The release names only a region. The pin sits inside the magenta ring, which marks the whole area — not where the object was.</p>`}`
        : html`<p class="caveat">No location was released for this record, so it is listed but not placed on the globe.</p>`,
    )}
    ${section(
      'SOURCES',
      html`<ul class="source-list">
        <li><span class="badge official">DVIDS</span><a href="${safeUrl(o.page)}" target="_blank" rel="noopener">DVIDS asset ${o.dvidsId}</a></li>
        <li><span class="badge official">WAR.GOV</span><a href="https://www.war.gov/UFO/" target="_blank" rel="noopener">war.gov/UFO — PURSUE releases</a></li>
      </ul><div class="btn-row"><button class="chip" data-action="share">⧉ COPY LINK</button><button class="chip" data-action="share-card">⇪ SHARE CARD</button></div>`,
    )}`;
  mount(body(), content);
  return token;
}

export function renderBlueBook(rec) {
  const token = open('PROJECT BLUE BOOK');
  const id = encodeURIComponent(rec.id);
  const content = html`
    <div class="d-title">Blue Book case file — ${rec.place}</div>
    <div class="d-sub">${rec.year}${rec.month ? `-${String(rec.month).padStart(2, '0')}` : ''} · U.S. Air Force · file ${rec.naid}<br />${
      rec.lat != null ? `${formatDMS(rec.lat, rec.lon)} · ${['NOT PLACED', 'REGION', 'TOWN', 'COORDINATES'][rec.prec]}` : 'Location not placed'
    }</div>
    <div class="d-badges"><span class="badge official">U.S. GOV FILE</span><span class="badge">OFFICIAL DOCUMENT</span></div>
    ${section(
      'SCANNED CASE FILE',
      html`<div class="video-wrap" style="aspect-ratio:3/4"><iframe src="https://archive.org/embed/${id}" title="Project Blue Book file ${rec.id}" loading="lazy" allowfullscreen></iframe></div>
      <div class="btn-row"><a class="chip" target="_blank" rel="noopener" href="https://archive.org/details/${id}">Open on Internet Archive ↗</a><a class="chip" target="_blank" rel="noopener" href="https://archive.org/download/${id}/${id}.pdf">PDF ↗</a><button class="chip" data-action="ocr" data-id="${rec.id}">READ OCR TEXT</button><button class="chip" data-action="share">⧉ COPY LINK</button></div>
      <div id="d-ocr"></div>
      <p class="caveat">Scans of National Archives microfilm T1206 mirrored on the Internet Archive. Place names were geocoded from the file name, so the pin marks the named town, not the exact sighting spot.</p>`,
    )}
    ${rec.lat != null && rec.prec >= 2 ? section('THE LOCATION', siteLinks(rec.lat, rec.lon)) : ''}`;
  mount(body(), content);
  return token;
}

export async function showOcr(id) {
  const el = document.getElementById('d-ocr');
  if (!el) return;
  el.innerHTML = '<div class="loading-line">Fetching OCR text…</div>';
  try {
    const res = await fetch(`https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(id)}_djvu.txt`);
    if (!res.ok) throw new Error(res.status);
    const text = (await res.text()).replace(/\n{3,}/g, '\n\n').slice(0, 6000);
    mount(el, html`<pre class="mono" style="white-space:pre-wrap;font-size:11px;line-height:1.45;max-height:320px;overflow:auto;background:rgba(0,0,0,.35);border:1px solid var(--glass-border);border-radius:9px;padding:10px;margin-top:8px">${text}</pre><p class="caveat">Machine OCR of 1950s–60s typescript — expect errors.</p>`);
  } catch {
    mount(el, html`<div class="loading-line">OCR text unavailable for this file.</div>`);
  }
}

/* ── GEIPAN (France) ───────────────────────────────────── */

const PREC_LABEL = ['NOT PLACED', 'DEPARTMENT', 'COMMUNE'];

/** A GEIPAN case: its classification, GEIPAN's French summary, and the sky and weather when the time is known. */
export function renderGeipan(r) {
  const token = open('GEIPAN · FRANCE');
  const info = classInfo(r.cls);
  const when = r.utc ? `${geipanDate(r)}, ${r.localTime} local · ${r.utc.slice(11, 16)} UTC` : geipanDate(r);
  const cut = r.summary.length >= 1200;
  const content = html`
    <div class="d-title">GEIPAN case — ${r.place}</div>
    <div class="d-sub">${when}<br />${r.zone}${r.dept && r.dept !== r.zone ? ` (${r.dept})` : ''} · file ${r.id}<br />${
      r.lat != null ? `${formatDMS(r.lat, r.lon)} · ${PREC_LABEL[r.prec]}` : 'Location not placed'
    }</div>
    <div class="d-badges">${statusBadge(info.status)}${classBadge(r.cls)}<span class="badge official">FRENCH GOV FILE</span>${
      r.witnesses ? html`<span class="badge">${r.witnesses} WITNESS${r.witnesses > 1 ? 'ES' : ''}</span>` : ''
    }</div>
    ${section('GEIPAN’S FINDING', html`<div class="explain"><b>${info.label}</b>${info.long}</div>
      <blockquote class="mufon-quote big" lang="fr">${r.short}</blockquote>`)}
    ${section(
      'CASE SUMMARY (FRENCH)',
      html`<div class="d-text geipan-text" lang="fr">${r.summary.split(/\n+/).map((p) => html`<p>${p}</p>`)}${cut ? html`<p class="dim">… continued in the full file.</p>` : ''}</div>
      <div class="btn-row">
        <a class="chip on" target="_blank" rel="noopener" href="${caseUrl(r)}">Full file on cnes-geipan.fr ↗</a>
        <a class="chip" target="_blank" rel="noopener" href="${translateUrl(`${r.short}\n\n${r.summary}`)}">Translate to English ↗</a>
        <button class="chip" data-action="share">⧉ COPY LINK</button>
      </div>
      <p class="caveat">GEIPAN’s own summary, in French. The full file on its site holds the testimonies, the investigation and often photos or sketches.</p>`,
    )}
    ${r.utc && r.lat != null ? section('SKY AT THE TIME', skyBlock(r.lat, r.lon, r.utc, bodiesNamed(`${r.short} ${r.summary}`))) : ''}
    ${r.utc && r.lat != null ? weatherBlock(r.utc) : ''}
    ${r.utc && r.lat != null ? launchBlock(r.lat, r.lon, r.utc) : ''}
    ${r.lat != null && r.prec === 2 ? section('THE LOCATION', html`${siteLinks(r.lat, r.lon)}<p class="caveat">The pin marks the commune named in the file, not the exact spot.</p>`) : ''}
    ${section(
      'SOURCE',
      html`<ul class="source-list">
        <li><span class="badge official">CNES</span><span>GEIPAN (Groupe d’études et d’informations sur les phénomènes aérospatiaux non identifiés), the UAP office of CNES, the French space agency, since 1977.</span></li>
        <li><span class="badge">DATA</span><a href="${GEIPAN_SEARCH}" target="_blank" rel="noopener">GEIPAN case search and published case files (CSV)</a></li>
        <li><span class="badge">SITE</span><a href="${GEIPAN_SITE}" target="_blank" rel="noopener">cnes-geipan.fr</a></li>
      </ul>`,
    )}`;
  mount(body(), content);
  if (r.utc && r.lat != null) {
    autoFillLaunches();
    fillWeather(token, r.lat, r.lon, r.utc, null);
  }
  return token;
}

/* ── MUFON files ───────────────────────────────────────── */

const mufonHref = (is, leaf) => `#/mufon/${encodeURIComponent(is.id)}/${leaf}`;
const journalHref = (is, leaf) => `#/journal/${encodeURIComponent(is.id)}/${leaf}`;
// Pages from the research archives carry their series; the MUFON Journal's do not.
const pageHref = (is, leaf) => (is.series ? journalHref(is, leaf) : mufonHref(is, leaf));
const pageBadge = (is) =>
  is.series ? html`<span class="badge journal">${SERIES_SHORT[is.series] || 'ARCHIVE'}</span>` : html`<span class="badge mufon">MUFON</span>`;

function mufonHitList(hits) {
  return html`<ul class="source-list mufon-hits">${hits.map(
    (h) => html`<li>${pageBadge(h.is)}<span><a href="${pageHref(h.is, h.leaf)}">${h.is.series === 'chapters' ? `${h.is.title} · ` : h.is.series && h.is.number ? `${h.is.number} · ` : ''}${issueDate(h.is)} · p. ${pageNumber(h.is, h.leaf)}</a>${
      h.place ? html` · ${h.place}` : ''
    }${h.distKm != null ? html` · ${Math.round(h.distKm)} km away` : ''}<span class="mufon-quote">${h.quote}</span></span></li>`,
  )}</ul>`;
}

function mufonCaseBlock(m) {
  if (!m.hits.length && !m.near.length)
    return html`<div class="loading-line">No pages in the journal archive matched this case.</div><p class="caveat">Searched the OCR text of ${m.issues} issues of Skylook and the MUFON UFO Journal (1967–2008) for “${m.term || 'the case name'}”.</p>`;
  return html`${m.hits.length ? html`<p class="d-text" style="margin:0 0 6px">Pages that mention <b>${m.term}</b>${m.total > m.hits.length ? ` (first ${m.hits.length} of ${m.total})` : ''}:</p>${mufonHitList(m.hits)}` : ''}
    ${m.near.length ? html`<p class="d-text" style="margin:10px 0 6px">Reports from nearby places named in the journal:</p>${mufonHitList(m.near)}` : ''}
    <p class="caveat">Found automatically in the OCR text of the MUFON UFO Journal archive (1967–2008). Open a page to read it in context.</p>
    ${m.term ? html`<div class="btn-row"><button class="chip" data-action="journal-search" data-q="${m.term}">⌕ SEARCH ALL JOURNALS FOR “${m.term}”</button></div>` : ''}`;
}

function journalCaseBlock(m) {
  if (!m.hits.length && !m.near.length)
    return html`<div class="loading-line">No pages in these archives matched this case.</div><p class="caveat">Searched the OCR text of ${m.issues} issues of the APRO Bulletin, NICAP’s U.F.O. Investigator, CUFOS’s International UFO Reporter and MUFON chapter newsletters for “${m.term || 'the case name'}”.</p>`;
  return html`${m.hits.length ? html`<p class="d-text" style="margin:0 0 6px">Pages that mention <b>${m.term}</b>${m.total > m.hits.length ? ` (first ${m.hits.length} of ${m.total})` : ''}:</p>${mufonHitList(m.hits)}` : ''}
    ${m.near.length ? html`<p class="d-text" style="margin:10px 0 6px">Reports from nearby places named in these journals:</p>${mufonHitList(m.near)}` : ''}
    <p class="caveat">Found automatically in the OCR text of the scans on the Internet Archive. Open a page to read it in context.</p>`;
}

/**
 * One journal page: the place picked on the map (if any), the page itself in
 * the Internet Archive reader, and the other places named in the issue. The
 * same view serves the MUFON Journal and the research archives (`org` names
 * the publisher of an archive issue).
 */
export function renderMufon({ is, leaf, record, onPage, inIssue, org = null }) {
  const token = open(is.series ? 'RESEARCH ARCHIVES' : 'MUFON FILES');
  const page = pageNumber(is, leaf);
  const others = inIssue.filter((r) => r !== record);
  const content = html`
    <div class="d-title">${record ? html`${record.place} <span class="dim">in</span> ${issueDate(is)}` : issueLabel(is)}</div>
    <div class="d-sub">${issueLabel(is)} · page ${page}${record ? html`<br />${formatDMS(record.lat, record.lon)} · TOWN NAMED IN THE TEXT` : ''}</div>
    <div class="d-badges">${statusBadge('unassessed')}${is.series ? pageBadge(is) : html`<span class="badge mufon">MUFON FILES</span>`}<span class="badge">CIVILIAN INVESTIGATION</span></div>
    ${record
      ? section('WHAT THE PAGE SAYS', html`<blockquote class="mufon-quote big">${record.quote}</blockquote>
        <p class="caveat">This place was found automatically in the OCR text. It is usually where a sighting happened, but it can be where a witness lived or a report came from. Read the page to check.</p>`)
      : ''}
    ${onPage.length > (record ? 1 : 0)
      ? section('PLACES ON THIS PAGE', mufonHitList(onPage.filter((r) => r !== record).map((r) => ({ is, leaf, place: r.place, quote: r.quote }))))
      : ''}
    ${section(
      'THE JOURNAL PAGE',
      html`<div class="video-wrap" style="aspect-ratio:3/4"><iframe src="${embedUrl(is, leaf)}" title="${issueLabel(is)}, page ${page}" loading="lazy" allowfullscreen></iframe></div>
      <div class="btn-row">
        ${leaf > (is.cover ? 1 : 0) ? html`<a class="chip" href="${pageHref(is, leaf - 1)}">◀ PAGE ${page - 1}</a>` : ''}
        ${leaf < is.pages - 1 ? html`<a class="chip" href="${pageHref(is, leaf + 1)}">PAGE ${page + 1} ▶</a>` : ''}
        <button class="chip" data-action="${is.series ? 'journal-text' : 'mufon-text'}" data-issue="${is.id}" data-leaf="${leaf}">READ PAGE TEXT</button>
        <a class="chip" target="_blank" rel="noopener" href="${readerUrl(is, leaf)}">Internet Archive ↗</a>
        <a class="chip" target="_blank" rel="noopener" href="${pdfUrl(is)}">PDF ↗</a>
        <button class="chip" data-action="share">⧉ COPY LINK</button>
      </div>
      <div id="d-mufon-text"></div>`,
    )}
    ${others.length
      ? section(
          `ELSEWHERE IN THIS ISSUE (${others.length})`,
          mufonHitList(others.slice(0, 40).map((r) => ({ is, leaf: r.leaf, place: r.place, quote: r.quote }))),
        )
      : ''}
    ${record ? section('THE LOCATION', siteLinks(record.lat, record.lon)) : ''}
    ${section(
      'SOURCE',
      is.series
        ? html`<ul class="source-list">
        <li>${pageBadge(is)}<span>${is.title}, published by ${org || 'its organisation'}.</span></li>
        <li><span class="badge">ARCHIVE</span><a href="${itemUrl(is)}" target="_blank" rel="noopener">This scan on the Internet Archive</a></li>
        ${SERIES_LINKS[is.series] ? html`<li><span class="badge">SERIES</span><a href="${SERIES_LINKS[is.series].url}" target="_blank" rel="noopener">${SERIES_LINKS[is.series].label}</a></li>` : ''}
      </ul>
      <p class="caveat">The app stores only the places, page numbers and short quotes; the pages are read from the Internet Archive.</p>`
        : html`<ul class="source-list">
        <li><span class="badge mufon">MUFON</span><span>${is.title}, published by the Mutual UFO Network. Released free as “The MUFON Archive” by MUFON and <a href="https://www.theblackvault.com/" target="_blank" rel="noopener">The Black Vault</a>.</span></li>
        <li><span class="badge">ARCHIVE</span><a href="${itemUrl()}" target="_blank" rel="noopener">Internet Archive: MUFON UFO Journal / Skylook, 1967–2008</a></li>
        <li><span class="badge">LICENCE</span><a href="${MUFON_LICENSE}" target="_blank" rel="noopener">CC BY-NC-ND 4.0 (as published on the Internet Archive)</a></li>
      </ul>`,
    )}`;
  mount(body(), content);
  return token;
}

export async function showMufonText(is, leaf) {
  const el = document.getElementById('d-mufon-text');
  if (!el) return;
  el.innerHTML = '<div class="loading-line">Fetching the page text…</div>';
  try {
    const text = await pageText(is, leaf);
    if (!document.body.contains(el)) return;
    mount(el, html`<pre class="mono ocr-text">${text || '(No text on this page.)'}</pre><p class="caveat">Machine OCR of the printed journal — expect errors.</p>`);
  } catch {
    mount(el, html`<div class="loading-line">Page text unavailable. Try the Internet Archive reader.</div>`);
  }
}

/* ── Near a place ──────────────────────────────────────── */

const km = (d) => (d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString());

/**
 * What has been reported near a point: curated cases and every archive layer,
 * nearest first. `data` fields arrive as they load; missing ones show a note.
 */
export function renderNearby({ label, lat, lon, data }) {
  const token = open('NEAR HERE');
  const list = (rows, row) => (rows.length ? html`<ul class="source-list">${rows.map(row)}</ul>` : html`<div class="loading-line">Nothing within range.</div>`);
  const pending = html`<div class="loading-line">Loading…</div>`;
  const block = (rows, row, note) => (rows == null ? pending : html`${list(rows, row)}${note ? html`<p class="caveat">${note}</p>` : ''}`);
  const d = data;
  const total = ['cases', 'bluebook', 'geipan', 'mufon', 'journals'].reduce((n, k) => n + (d[k]?.length || 0), 0);
  mount(
    body(),
    html`<div class="d-title">Reported near ${label}</div>
    <div class="d-sub">${formatDMS(lat, lon)}${d.done ? html`<br />${total.toLocaleString()} records within range${d.nuforc != null ? ` · ${d.nuforc.toLocaleString()} civilian reports within 50 km` : ''}` : ''}</div>
    ${section('CASE FILES WITHIN 250 KM', block(d.cases, (c) => html`<li>${statusBadge(c.status)}<span><a href="#/${c.kind}/${encodeURIComponent(c.id)}">${c.title}</a> · ${c.year} · ${km(c.distKm)} km</span></li>`))}
    ${section('PROJECT BLUE BOOK WITHIN 100 KM', block(d.bluebook, (r) => html`<li><span class="badge">USAF</span><span><a href="#/bluebook/${encodeURIComponent(r.id)}">${r.place}</a> · ${r.year}${r.month ? `-${String(r.month).padStart(2, '0')}` : ''} · ${km(r.distKm)} km</span></li>`, 'Air Force case files placed at the town in their file name.'))}
    ${d.geipan !== undefined ? section('GEIPAN (FRANCE) WITHIN 50 KM', block(d.geipan, (r) => html`<li>${classBadge(r.cls)}<span><a href="#/geipan/${encodeURIComponent(r.id)}">${r.place}</a> · ${geipanDate(r)} · ${km(r.distKm)} km<span class="mufon-quote" lang="fr">${r.short}</span></span></li>`)) : ''}
    ${section('MUFON JOURNAL WITHIN 60 KM', block(d.mufon, (h) => html`<li>${pageBadge(h.is)}<span><a href="${pageHref(h.is, h.leaf)}">${h.place}</a> · ${issueDate(h.is)} · ${km(h.distKm)} km<span class="mufon-quote">${h.quote}</span></span></li>`))}
    ${section('APRO, NICAP, CUFOS & MUFON CHAPTERS WITHIN 60 KM', block(d.journals, (h) => html`<li>${pageBadge(h.is)}<span><a href="${pageHref(h.is, h.leaf)}">${h.place}</a> · ${issueDate(h.is)} · ${km(h.distKm)} km<span class="mufon-quote">${h.quote}</span></span></li>`))}
    ${section(
      'CIVILIAN REPORTS (NUFORC)',
      d.nuforc == null
        ? html`<div class="btn-row"><button class="chip" data-action="near-nuforc">COUNT REPORTS WITHIN 50 KM</button></div><p class="caveat">Loads the ~80,000-report layer.</p>`
        : html`<p class="d-text"><b>${d.nuforc.toLocaleString()}</b> unverified reports within 50 km (1906–2014). Turn on <b>Civilian reports</b> to see them.</p>`,
    )}
    ${section('WHAT’S OVERHEAD NOW', html`<div class="btn-row"><button class="chip" data-action="skycheck">RUN SKY CHECK HERE</button><button class="chip on" data-action="explain-here">WHAT DID I SEE?</button></div><div id="d-sky"></div>`)}
    ${section('THE LOCATION', siteLinks(lat, lon))}`,
  );
  return token;
}

export function renderNuforc(r) {
  open('NUFORC REPORT');
  mount(
    body(),
    html`<div class="d-title">Civilian report — ${r.place}</div>
    <div class="d-sub">${r.date} · ${formatDMS(r.lat, r.lon)}</div>
    <div class="d-badges">${statusBadge('unassessed')}<span class="badge">CIVILIAN REPORT</span></div>
    ${section('REPORT', html`<dl class="d-kv"><dt>SHAPE</dt><dd>${r.shape}</dd><dt>DURATION</dt><dd>${formatDuration(r.dur)}</dd><dt>PLACE</dt><dd>${r.place}</dd></dl>
      <p class="caveat">From the National UFO Reporting Center database (geocoded scrape, 1906–2014). Narratives are omitted. Reports are unverified and many have mundane causes.</p>
      <div class="btn-row"><a class="chip" href="https://nuforc.org/" target="_blank" rel="noopener">nuforc.org ↗</a></div>`)}
    ${section('THE LOCATION', siteLinks(r.lat, r.lon))}`,
  );
}

export function renderUser(item, { onDelete }) {
  const u = item.ref;
  const token = open('MY SIGHTING');
  mount(
    body(),
    html`<div class="d-title">${u.title || 'My sighting'}</div>
    <div class="d-sub">${fmtDate(new Date(u.date), { hour: '2-digit', minute: '2-digit' })} · ${formatDMS(u.lat, u.lon)}</div>
    <div class="d-badges"><span class="badge" style="color:#c6ff5c">LOGGED BY YOU</span>${u.shape ? html`<span class="badge">${u.shape.toUpperCase()}</span>` : ''}</div>
    ${section('NOTES', html`<div class="d-text"><p>${u.description || 'No notes.'}</p></div>
      <dl class="d-kv" style="margin-top:8px"><dt>DURATION</dt><dd>${u.duration || '—'}</dd><dt>WITNESSES</dt><dd>${u.witnesses || '—'}</dd>${
        u.media ? html`<dt>MEDIA</dt><dd><a href="${safeUrl(u.media)}" target="_blank" rel="noopener">${u.media}</a></dd>` : ''
      }</dl>`)}
    <div class="btn-row" style="margin:12px 0 0"><button class="chip on" data-action="explain-user">WHAT WAS IT? RUN THE CHECKER</button></div>
    ${section('SKY AT THE TIME', skyBlock(u.lat, u.lon, u.date))}
    ${weatherBlock(u.date)}
    ${launchBlock(u.lat, u.lon, u.date)}
    ${section('SATELLITES OVERHEAD NOW', html`<p class="d-text">Turn on <b>Live satellites</b> to see what is overhead right now — Starlink trains and flaring satellites explain many modern reports.</p>
      <div class="btn-row"><button class="chip" data-action="skycheck">RUN SKY CHECK HERE</button></div><div id="d-sky"></div>`)}
    ${section('REPORT IT OFFICIALLY', html`<div class="btn-row"><a class="chip" href="https://nuforc.org/" target="_blank" rel="noopener">NUFORC ↗</a><a class="chip" href="https://www.mufoncms.com/" target="_blank" rel="noopener">MUFON ↗</a><a class="chip" href="https://www.aaro.mil/" target="_blank" rel="noopener">AARO (gov/mil personnel) ↗</a><a class="chip" href="https://www.cnes-geipan.fr/" target="_blank" rel="noopener">GEIPAN (France) ↗</a></div>`)}
    ${section('THE LOCATION', siteLinks(u.lat, u.lon))}
    <div class="btn-row" style="margin-top:14px"><button class="chip" data-action="export-user">⇩ EXPORT MY SIGHTINGS (GeoJSON)</button><button class="chip" data-action="delete-user">Delete this entry</button></div>`,
  );
  autoFillLaunches();
  fillWeather(token, u.lat, u.lon, u.date, null);
  body().querySelector('[data-action="delete-user"]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Delete this sighting from this browser?')) onDelete(u.id);
  });
}

export function renderSatellite(info) {
  open('SATELLITE');
  mount(
    body(),
    html`<div class="d-title">${info.name}</div>
    <div class="d-sub">NORAD ${info.norad} · ${info.group}</div>
    ${section('RIGHT NOW', html`<dl class="d-kv"><dt>ALTITUDE</dt><dd>${info.altKm?.toFixed(0)} km</dd><dt>SPEED</dt><dd>${info.speed ? `${(info.speed * 3600).toFixed(0)} km/h` : '—'}</dd><dt>POSITION</dt><dd>${formatDMS(info.lat, info.lon)}</dd></dl>
      <p class="caveat">Propagated live from CelesTrak element sets with SGP4 (satellite.js).</p>`)}`,
  );
}

export function renderSkyCheck(list) {
  const el = document.getElementById('d-sky');
  if (!el) return;
  if (list === 'loading') {
    mount(el, html`<div class="loading-line">Loading satellite orbits from CelesTrak…</div>`);
    return;
  }
  if (!list) {
    mount(el, html`<div class="loading-line">Satellite orbits could not be loaded from CelesTrak.</div>`);
    return;
  }
  mount(
    el,
    html`<p class="d-text" style="margin-top:8px"><b>${list.length}</b> satellites are more than 10° above the horizon here right now${list.length ? ':' : '.'}</p>
    <ul class="source-list" style="margin-top:6px">${list.slice(0, 15).map((s) => html`<li><span class="badge">${Math.round(s.elevation)}°</span><span>${s.name} <span class="dim">· az ${Math.round(s.azimuth)}° · ${Math.round(s.rangeKm)} km · ${s.group}</span></span></li>`)}</ul>`,
  );
}

/** Delegated button handling inside the dossier. */
export function bindDossierActions(handlers) {
  body().addEventListener('click', (e) => {
    const lb = e.target.closest('[data-lightbox]');
    if (lb) {
      handlers.lightbox(lb.dataset);
      return;
    }
    const play = e.target.closest('.dvids-play');
    if (play) {
      const wrap = play.closest('[data-dvids]');
      wrap.innerHTML = `<iframe src="https://www.dvidshub.net/video/embed/${encodeURIComponent(wrap.dataset.dvids)}" allow="autoplay; fullscreen" allowfullscreen title="Official DVIDS video"></iframe>`;
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'launch-check') {
      const el = btn.closest('#d-launches');
      if (el) fillLaunches(el);
      return;
    }
    if (action === 'share') {
      // Clipboard access needs a secure context; fall back to showing the link.
      const url = shareLink();
      if (!navigator.clipboard?.writeText) return toast(url, 6000);
      navigator.clipboard.writeText(url).then(
        () => toast('Link copied'),
        () => toast(url, 6000),
      );
      return;
    }
    handlers[action]?.(btn);
  });
}
