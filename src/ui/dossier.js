import { html, raw, mount, esc, safeUrl, toast } from '../util/dom.js';
import { EVIDENCE, STATUS, CATEGORY, TRACK_KINDS, TRACK_BASIS, PRECISION, evidenceScore } from '../data/taxonomy.js';
import { formatDMS, formatDuration, haversineKm } from '../util/geo.js';
import { trackStats } from '../layers/tracks.js';
import { wikiSummary, commonsFiles, photosNear, commonsPage } from '../services/wiki.js';
import { skyAt, bodiesNamedIn, compass } from '../services/sky.js';
import { weatherAt, weatherAvailable, describeWeatherCode, driftToward, trackVsWind } from '../services/weather.js';
import { launchesNear, cachedLaunchesNear, RateLimitError } from '../services/launches.js';
import { skySection } from './skychart.js';
import { AIRSPACE_TYPES, formatFt, nearUS } from '../services/airspace.js';
import { relativeTime } from '../layers/launches.js';

/**
 * Right-hand dossier. One renderer per record type; async sections (Commons
 * media, Wikipedia, nearby photos, Blue Book matches) fill in after the
 * static part is on screen.
 */
const panel = () => document.getElementById('dossier');
const body = () => document.getElementById('dossier-body');
let renderToken = 0;

const fmtDate = (d, opts = {}) =>
  d.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', ...opts });

/** "13 Mar 1997, 19:55 local (UTC−07:00) · 02:55 UTC" from an ISO string with offset. */
function localAndUtc(iso) {
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
function skyBlock(lat, lon, when, explanation = '') {
  try {
    const sky = skyAt(lat, lon, when);
    const year = new Date(when).getUTCFullYear();
    const note = year < 1583 ? '(dates before 1583 are read as Gregorian, so allow for the calendar change)' : '';
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

async function fillWeather(token, lat, lon, when, uapTrack) {
  const el = document.getElementById('d-weather');
  if (!el) return;
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
          <dt>SKY</dt><dd>${describeWeatherCode(wx.weather_code)} · cloud ${wx.cloud_cover ?? '—'}% <span class="dim">(low ${wx.cloud_cover_low ?? '—'} · mid ${wx.cloud_cover_mid ?? '—'} · high ${wx.cloud_cover_high ?? '—'})</span></dd>
          <dt>WIND 10 M</dt><dd>${windLine(wx.wind_speed_10m, wx.wind_direction_10m)}${wx.wind_gusts_10m ? html` <span class="dim">· gusts ${Math.round(wx.wind_gusts_10m)}</span>` : ''}</dd>
          <dt>WIND 100 M</dt><dd>${windLine(wx.wind_speed_100m, wx.wind_direction_100m)}</dd>
          <dt>TEMP</dt><dd>${wx.temperature_2m != null ? `${Math.round(wx.temperature_2m)} °C` : '—'}${wx.precipitation ? ` · ${wx.precipitation} mm precipitation` : ''}</dd>
        </dl>
      </div>
      ${verdict ? html`<p class="d-text wx-verdict">${verdict}</p>` : ''}
      <p class="caveat">${wx.source}, hour of ${wx.hour.slice(0, 13).replace('T', ' ')}:00 UTC, on a ~25 km grid. Local conditions can differ, and winds aloft are often stronger and from a different direction.</p>`,
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

function imageCard(info, caption) {
  const credit = [info.artist, info.license].filter(Boolean).join(' · ');
  return html`<figure class="media-card" data-lightbox="${safeUrl(info.url.endsWith('.pdf') ? info.thumb : info.url)}" data-caption="${caption || info.description || info.title}" data-credit="${credit}" data-href="${safeUrl(info.page)}">
    <img src="${safeUrl(info.thumb)}" alt="${caption || info.title}" loading="lazy" />
    ${info.mime === 'application/pdf' ? html`<span class="badge kind">PDF</span>` : ''}
    <figcaption>${caption || info.title.replace(/^File:/, '')}</figcaption>
  </figure>`;
}

async function fillMedia(token, container, media, officialById) {
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
      else if (info) images.push(imageCard(info, m.caption));
      else players.push(html`<div class="loading-line">Could not load ${m.commons}</div>`);
    }
  }
  mount(
    container,
    html`${players}${images.length ? html`<div class="media-grid ${images.length === 1 ? 'one' : ''}">${images}</div>` : ''}${
      !players.length && !images.length ? html`<div class="loading-line">No archived media for this case.</div>` : ''
    }`,
  );
}

async function fillWiki(token, container, title) {
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

async function fillNearby(token, container, lat, lon, radiusM) {
  try {
    const photos = (await photosNear(lat, lon, radiusM, 30)).slice(0, 12);
    if (token !== renderToken) return;
    if (!photos.length) {
      mount(container, html`<div class="loading-line">No geotagged photos on Wikimedia Commons within ${Math.round(radiusM / 1000)} km.</div>`);
      return;
    }
    mount(
      container,
      html`<div class="media-grid">${photos.map((ph) => {
        const d = ph.lat != null ? haversineKm(lat, lon, ph.lat, ph.lon) : null;
        return imageCard(ph, `${d != null ? `${d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`} from site · ` : ''}${ph.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')}`);
      })}</div><p class="caveat">Present-day photos geotagged near the coordinates (Wikimedia Commons). They show the place, not the phenomenon.</p>`,
    );
  } catch {
    mount(container, html`<div class="loading-line">Nearby photos unavailable (Commons rate limit?).</div>`);
  }
}

function bluebookList(records) {
  if (!records.length) return html`<div class="loading-line">No matching Blue Book files.</div>`;
  return html`<ul class="source-list">${records.map(
    (r) => html`<li><span class="badge">USAF</span><span><a href="#/bluebook/${encodeURIComponent(r.id)}">${r.place}</a> · ${r.year}${r.month ? `-${String(r.month).padStart(2, '0')}` : ''}${r.distKm != null ? ` · ${Math.round(r.distKm)} km away` : ''}
      <a class="dim" href="https://archive.org/details/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">archive ↗</a></span></li>`,
  )}</ul>`;
}

/* ── Renderers ─────────────────────────────────────────── */

export function renderCase(item, ctx) {
  const c = item.ref;
  const token = open(c.id);
  const date = new Date(c.date);
  const tracks = c.tracks || [];
  const hasSite = c.precision !== 'region';
  const content = html`
    <div class="d-title">${c.title}</div>
    <div class="d-sub">${localAndUtc(c.date)}<br />${c.place}<br />
      ${formatDMS(c.lat, c.lon)} · <span title="${PRECISION[c.precision]}">${(c.precision || '').toUpperCase()}</span></div>
    <div class="d-badges">${statusBadge(c.status)}<span class="badge">${CATEGORY[c.category] || c.category}</span>${
      tracks.length ? html`<span class="badge path">${tracks.length} TRACK${tracks.length > 1 ? 'S' : ''}</span>` : ''
    }${evidenceBadges(c.evidence)}</div>

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

    ${section('SKY AT THE TIME', skyBlock(c.lat, c.lon, c.date, c.explanation))}
    ${weatherBlock(c.date)}
    ${launchBlock(c.lat, c.lon, c.date)}
    ${nearUS(c.lat, c.lon) ? section('MILITARY AIRSPACE', html`<div id="d-airspace"><div class="loading-line">Checking FAA special-use airspace…</div></div>`) : ''}

    ${section('EVIDENCE & MEDIA', html`<div id="d-media"><div class="loading-line">Loading archived images and video…</div></div>`)}
    ${section('GOVERNMENT FILES — PROJECT BLUE BOOK', html`<div id="d-bluebook"><div class="loading-line">${
      date.getUTCFullYear() >= 1947 && date.getUTCFullYear() <= 1970 ? 'Searching Blue Book case files…' : 'Outside Blue Book’s 1947–1969 coverage.'
    }</div></div>`)}
    ${c.wiki ? section('REFERENCE', html`<div id="d-wiki"><div class="loading-line">Loading Wikipedia…</div></div>`) : ''}
    ${section(
      'THE LOCATION',
      html`<div class="btn-row" style="margin:0 0 8px"><button class="chip" data-action="ground">⤓ FLY TO GROUND VIEW</button><button class="chip" data-action="share">⧉ COPY LINK</button></div>
        ${siteLinks(c.lat, c.lon)}
        ${hasSite ? html`<div id="d-nearby" style="margin-top:10px"><div class="loading-line">Finding photos taken near the site…</div></div>` : html`<p class="caveat">Only a region is known for this case, so no site photos are shown.</p>`}`,
    )}
    ${section(
      'SOURCES',
      html`<ul class="source-list">
        ${c.wiki ? html`<li><span class="badge">WIKI</span><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(c.wiki.replace(/ /g, '_'))}" target="_blank" rel="noopener">${c.wiki}</a></li>` : ''}
        ${(c.sources || []).map((s) => html`<li><span class="badge ${s.kind === 'official' ? 'official' : ''}">${(s.kind || 'ref').toUpperCase()}</span><a href="${safeUrl(s.url)}" target="_blank" rel="noopener">${s.label}</a></li>`)}
        ${(c.media || []).filter((m) => m.commons).map((m) => html`<li><span class="badge">MEDIA</span><a href="${commonsPage(m.commons)}" target="_blank" rel="noopener">${m.caption || m.commons}</a></li>`)}
      </ul>`,
    )}`;
  mount(body(), content);

  autoFillLaunches();
  fillWeather(token, c.lat, c.lon, c.date, tracks.find((t) => t.kind === 'uap'));
  if (nearUS(c.lat, c.lon) && ctx.airspaceFor) fillAirspace(token, ctx.airspaceFor(c));
  fillMedia(token, document.getElementById('d-media'), c.media || [], ctx.officialById);
  if (c.wiki) fillWiki(token, document.getElementById('d-wiki'), c.wiki);
  if (hasSite) {
    const radius = { site: 3000, city: 8000, area: 10000 }[c.precision] || 8000;
    fillNearby(token, document.getElementById('d-nearby'), c.lat, c.lon, radius);
  }
  const year = date.getUTCFullYear();
  if (year >= 1947 && year <= 1970)
    ctx.bluebookNear(c, 150).then((records) => {
      if (token !== renderToken) return;
      mount(
        document.getElementById('d-bluebook'),
        html`${bluebookList(records)}<p class="caveat">U.S. Air Force case files from the same month within 150 km, plus files linked to this case. Click to open the scanned file.</p>`,
      );
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
      </ul><div class="btn-row"><button class="chip" data-action="share">⧉ COPY LINK</button></div>`,
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
    ${section('REPORT IT OFFICIALLY', html`<div class="btn-row"><a class="chip" href="https://nuforc.org/" target="_blank" rel="noopener">NUFORC ↗</a><a class="chip" href="https://www.aaro.mil/" target="_blank" rel="noopener">AARO (gov/mil personnel) ↗</a><a class="chip" href="https://www.cnes-geipan.fr/" target="_blank" rel="noopener">GEIPAN (France) ↗</a></div>`)}
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
  if (!list) {
    mount(el, html`<div class="loading-line">Turn on the Live satellites layer first, then run the check.</div>`);
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
      navigator.clipboard?.writeText(location.href).then(
        () => toast('Link copied'),
        () => toast(location.href, 5000),
      );
      return;
    }
    handlers[action]?.(btn);
  });
}
