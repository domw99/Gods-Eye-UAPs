import { html, mount, safeUrl, toast } from '../util/dom.js';
import { GOV_FILES } from '../data/govFiles.js';
import { commonsPage } from '../services/wiki.js';
import { STATUS, CATEGORY, EVIDENCE, SHAPES, evidenceScore, shapeClasses } from '../data/taxonomy.js';
import { trackStats } from '../layers/tracks.js';
import { skyAt } from '../services/sky.js';
import { formatDuration } from '../util/geo.js';
import { issueDate } from '../services/mufon.js';

/** Modal dialogs: government files library, sighting log, about, lightbox. */
const root = () => document.getElementById('modal-root');
let lastFocus = null;

export function closeModal() {
  mount(root(), html``);
  lastFocus?.focus?.();
}

function modal(title, content, { wide = true } = {}) {
  lastFocus = document.activeElement;
  mount(
    root(),
    html`<div class="modal-backdrop" data-close>
      <div class="modal glass" role="dialog" aria-modal="true" aria-label="${title}" style="${wide ? '' : 'width:min(620px,100%)'}">
        <div class="panel-head"><span class="panel-title">${title}</span><span class="muted"></span><button class="icon-btn" data-close aria-label="Close">✕</button></div>
        <div class="panel-body">${content}</div>
      </div>
    </div>`,
  );
  const backdrop = root().querySelector('.modal-backdrop');
  backdrop.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close') || e.target.closest('button[data-close]')) closeModal();
    // In-app links (#/case/…, #/mufon/…) open a record behind the dialog, so close it.
    else if (e.target.closest('a[href^="#/"]')) closeModal();
  });
  backdrop.querySelector('.modal button, .modal input, .modal a')?.focus();
  return backdrop;
}

export function openGovFiles(stats, officialUnplaced = [], mufonPromise = null) {
  const groups = [...new Set(GOV_FILES.map((f) => f.group))];
  const content = html`
    <h2>UFO / UAP files</h2>
    <p class="lead">Primary sources from the U.S. government, other governments and MUFON. Official videos are on the globe (magenta), Project Blue Book case files (amber) and the MUFON files (violet) are map layers, and every link below opens the original archive.</p>
    <div class="stat-row">
      <div class="stat"><div class="v">${stats.cases}</div><div class="k">CURATED CASE FILES</div></div>
      <div class="stat"><div class="v">${stats.official}</div><div class="k">OFFICIAL U.S. RELEASES</div></div>
      <div class="stat"><div class="v">${stats.bluebook}</div><div class="k">BLUE BOOK FILES</div></div>
      <div class="stat"><div class="v">${stats.mufon}</div><div class="k">MUFON JOURNAL ISSUES</div></div>
      <div class="stat"><div class="v">${stats.nuforc}</div><div class="k">CIVILIAN REPORTS</div></div>
    </div>
    ${groups.map(
      (group) => html`<div class="section-label" style="margin-top:16px">${group.toUpperCase()}</div>
      <div class="files-grid">${GOV_FILES.filter((f) => f.group === group).map(
        (f) => html`<article class="file-card">
          <h4>${f.title}</h4>
          <div class="meta">${f.agency} · ${f.years}</div>
          <p>${f.text}</p>
          <div class="links">
            ${(f.links || []).map((l) => html`<a class="chip small" href="${safeUrl(l.url)}" target="_blank" rel="noopener">${l.label} ↗</a>`)}
            ${(f.commons || []).map((d) => html`<a class="chip small" href="${commonsPage(d.file)}" target="_blank" rel="noopener">📄 ${d.label}</a>`)}
          </div>
        </article>`,
      )}</div>${group === 'The MUFON files' ? html`<div id="mufon-browse" class="mufon-browse"><div class="loading-line">Loading the journal index…</div></div>` : ''}`,
    )}
    ${officialUnplaced.length
      ? html`<div class="section-label" style="margin-top:18px">OFFICIAL RECORDS WITHOUT A LOCATION (${officialUnplaced.length})</div>
        <ul class="source-list">${officialUnplaced.map(
          (o) => html`<li><span class="badge official">${o.type === 'video' ? 'VIDEO' : 'IMAGE'}</span><a href="#/official/${o.dvidsId}">${o.title}</a></li>`,
        )}</ul>`
      : ''}`;
  modal('FILES', content);
  if (mufonPromise) fillMufonBrowse(mufonPromise);
}

/** Every journal issue by year, and the chapter newsletters by chapter. */
async function fillMufonBrowse(promise) {
  const el = document.getElementById('mufon-browse');
  try {
    const m = await promise;
    if (!document.body.contains(el)) return;
    const years = [...new Set(m.issues.map((is) => is.year))];
    const first = (is) => (is.cover ? 1 : 0);
    mount(
      el,
      html`<div class="section-label" style="margin-top:12px">MUFON UFO JOURNAL — EVERY ISSUE (${m.issues.length})</div>
      <div class="mufon-years">${years.map(
        (y) => html`<details><summary>${y}</summary><div class="links">${m.issues
          .filter((is) => is.year === y)
          .map((is) => html`<a class="chip small" href="#/mufon/${encodeURIComponent(is.id)}/${first(is)}">${issueDate(is).replace(` ${y}`, '')}${is.number ? ` · No. ${is.number}` : ''}</a>`)}</div></details>`,
      )}</div>
      ${m.chapters.length
        ? html`<div class="section-label" style="margin-top:12px">CHAPTER NEWSLETTERS (${m.chapters.reduce((n, c) => n + c.items.length, 0)})</div>
          <div class="mufon-years">${m.chapters.map(
            (c) => html`<details><summary>${c.name} <span class="dim">· ${c.items.length}</span></summary><div class="links">${c.items.map(
              ([id, title, date]) => html`<a class="chip small" href="https://archive.org/details/${encodeURIComponent(id)}" target="_blank" rel="noopener">${date ? date.slice(0, 7) : title} ↗</a>`,
            )}</div></details>`,
          )}</div>`
        : ''}`,
    );
  } catch {
    if (document.body.contains(el)) mount(el, html`<div class="loading-line">The journal index could not be loaded.</div>`);
  }
}

export function openAbout(meta) {
  const content = html`
    <h2>About God’s Eye // UAP</h2>
    <p class="lead">A UAP-only edition of the God’s Eye View globe: documented encounters, reconstructed flight paths, the official U.S. government footage and files, and reference imagery of each place.</p>
    <div class="section-label">WHAT YOU ARE LOOKING AT</div>
    <div class="d-text">
      <p><b style="color:#00d4ff">Case files</b> — curated encounters with evidence (radar, sensor video, photos, official documents, physical traces or many credible witnesses). Each lists the official or best-supported explanation, including when a case has been solved. Flight paths are reconstructions from the reports; every track states its basis (radar, official report, witness reports, flight plan, or approximate).</p>
      <p><b style="color:#ff5ce1">Official U.S. footage</b> — every UAP video and image the Department of War / AARO has published on DVIDS (PURSUE, war.gov/UFO). Most releases give only a region, shown as a ring.</p>
      <p><b style="color:#ffb547">Project Blue Book</b> — scanned U.S. Air Force case files (1947–1969), geocoded from their file names.</p>
      <p><b style="color:#b58cff">MUFON files</b> — the Mutual UFO Network’s journal (Skylook and the MUFON UFO Journal, 1967–2008), released free by MUFON and The Black Vault. Towns named in its sighting reports are on the map, found automatically in the OCR text, and each links to its page. Case dossiers list the journal pages that discuss them.</p>
      <p><b style="color:#ff7a45">Civilian reports</b> — ~80,000 NUFORC reports (1906–2014), unverified, narratives removed.</p>
      <p><b style="color:#ffcf5c">Rocket launches</b> and <b style="color:#ff9f1c">military airspace</b> — context layers from Launch Library 2 and the FAA. Every case also shows the sky, the weather and any military areas at that time and place.</p>
      <p><b style="color:#7dd3ff">Live satellites</b> — current Starlink, ISS and bright-satellite positions from CelesTrak, to check what is overhead now.</p>
    </div>
    <div class="section-label">DATA SNAPSHOT</div>
    <div class="d-text"><p>Official catalogue synced ${meta.officialGenerated?.slice(0, 10) || '—'} · Blue Book layer built ${meta.bluebookGenerated?.slice(0, 10) || '(loads on demand)'}. Refresh with <code>npm run sync:official</code>, <code>npm run build:bluebook</code> and <code>npm run build:nuforc</code>.</p></div>
    <div class="section-label">KEYBOARD</div>
    <dl class="d-kv"><dt>1 – 5</dt><dd>Sensor modes: Normal, NVG, FLIR, Ironbow, CRT</dd><dt>/</dt><dd>Search</dd><dt>[ ]</dt><dd>Previous / next case</dd><dt>SPACE</dt><dd>Play / pause flight path</dd><dt>T</dt><dd>Guided tour</dd><dt>G</dt><dd>Files library (government + MUFON)</dd><dt>E</dt><dd>What did I see? (sighting checker)</dd><dt>L</dt><dd>Log a sighting</dd><dt>M</dt><dd>3D map settings (OSM buildings, your Google key)</dd><dt>V</dt><dd>Witness view during playback</dd><dt>R</dt><dd>Reset view: whole globe, north up</dd><dt>+ −</dt><dd>Zoom toward the centre of the screen</dd><dt>H</dt><dd>Hide HUD</dd><dt>ESC</dt><dd>Close</dd></dl>
    <div class="section-label">CREDITS</div>
    <div class="d-text"><p>Visual language after <a href="https://github.com/bilawalsidhu/gods-eye-view" target="_blank" rel="noopener">God’s Eye View</a> by Bilawal Sidhu (MIT). Globe: CesiumJS. Imagery: Esri World Imagery (Powered by Esri). Terrain: Re:Earth / Mapterhorn (CC BY 4.0). Geocoding: GeoNames (CC BY 4.0). Media: Wikimedia Commons (licences shown per file), DVIDS (public domain), Internet Archive. Summaries: Wikipedia (CC BY-SA). Satellites: CelesTrak.</p>
    <p class="caveat">This console presents evidence and official assessments; it does not claim any case is extraterrestrial. Many famous cases have mundane explanations, and those are shown alongside the reports.</p></div>`;
  modal('ABOUT', content, { wide: false });
}

export function openLogForm({ lat, lon, onSave, prefill = {} }) {
  const now = prefill.date ? new Date(prefill.date) : new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const content = html`
    <h2>Log a sighting</h2>
    <p class="lead">Saved only in this browser (you can export it as GeoJSON). The location defaults to the centre of the current view — use your device location for accuracy.</p>
    <form id="log-form" class="form-grid">
      <label class="full">TITLE<input name="title" required maxlength="120" placeholder="e.g. Three silent orange lights" /></label>
      <label>DATE & TIME<input name="date" type="datetime-local" required value="${local}" /></label>
      <label>SHAPE<select name="shape"><option value="">—</option>${['light', 'orb/sphere', 'disc', 'triangle', 'cigar/cylinder', 'tic tac', 'formation', 'fireball', 'other'].map((s) => html`<option>${s}</option>`)}</select></label>
      <label>LATITUDE<input name="lat" type="number" step="any" min="-90" max="90" required value="${lat.toFixed(5)}" /></label>
      <label>LONGITUDE<input name="lon" type="number" step="any" min="-180" max="180" required value="${lon.toFixed(5)}" /></label>
      <label>DURATION<input name="duration" maxlength="60" placeholder="e.g. 2 minutes" /></label>
      <label>WITNESSES<input name="witnesses" maxlength="60" placeholder="e.g. 3" /></label>
      <label class="full">WHAT HAPPENED<textarea name="description" maxlength="4000" placeholder="Direction of travel, altitude/angle, sound, colour, how it left…">${prefill.description || ''}</textarea></label>
      <label class="full">PHOTO / VIDEO LINK (optional)<input name="media" type="url" placeholder="https://…" /></label>
      <div class="full btn-row"><button type="button" class="chip" id="log-geo">⌖ USE MY LOCATION</button><button type="submit" class="chip on">SAVE SIGHTING</button></div>
    </form>`;
  const el = modal('LOG SIGHTING', content, { wide: false });
  const form = el.querySelector('#log-form');
  el.querySelector('#log-geo').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocation unavailable');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.lat.value = pos.coords.latitude.toFixed(5);
        form.lon.value = pos.coords.longitude.toFixed(5);
        toast('Location set');
      },
      () => toast('Location permission denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title: f.get('title').trim(),
      date: when.toISOString(),
      lat: Number(f.get('lat')),
      lon: Number(f.get('lon')),
      shape: f.get('shape'),
      duration: f.get('duration').trim(),
      witnesses: f.get('witnesses').trim(),
      description: f.get('description').trim(),
      media: f.get('media').trim(),
    };
    if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) return toast('Check the coordinates');
    closeModal();
    onSave(entry);
  });
}

export function openLightbox({ lightbox, caption, credit, href }) {
  lastFocus = document.activeElement;
  mount(
    root(),
    html`<div class="lightbox" data-close role="dialog" aria-modal="true" aria-label="${caption || 'Image'}">
      <img src="${safeUrl(lightbox)}" alt="${caption || ''}" />
      <div class="cap">${caption || ''}${credit ? html`<br /><span class="dim">${credit}</span>` : ''}${href && href !== '#' ? html` · <a href="${safeUrl(href)}" target="_blank" rel="noopener">source ↗</a>` : ''}</div>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>`,
  );
  const lb = root().querySelector('.lightbox');
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.closest('button[data-close]')) closeModal();
  });
  lb.querySelector('button').focus();
}

/**
 * 3D map settings: the free OpenStreetMap buildings, and Google Photorealistic
 * 3D Tiles with the user's own API key (kept in this browser only).
 */
export function openMapSettings(o) {
  const google = o.photoreal.active
    ? `ON — ${o.photoreal.source}`
    : o.hasStoredKey
      ? 'OFF — your key is saved in this browser'
      : o.envKey || o.ionToken
        ? 'OFF — this site has a key configured'
        : 'OFF — no key yet';
  const content = html`
    <h2>3D map</h2>
    <p class="lead">There are two ways to see cities in 3D. OpenStreetMap buildings are free and need nothing. Google's photorealistic 3D tiles need your own API key.</p>

    <div class="section-label">FREE — OPENSTREETMAP 3D BUILDINGS</div>
    <div class="d-text"><p>Building footprints and heights from OpenStreetMap, served keyless by OpenFreeMap and raised on the terrain. They appear when you zoom into a town (below about 9 km altitude). Detail depends on how well the area is mapped. "Fly to ground view" turns them on.</p></div>
    <div class="btn-row"><button type="button" class="chip ${o.buildingsOn ? 'on' : ''}" id="ms-osm" aria-pressed="${o.buildingsOn ? 'true' : 'false'}">${o.buildingsOn ? '✓ OSM BUILDINGS ON' : 'OSM BUILDINGS OFF'}</button></div>

    <div class="section-label">GOOGLE PHOTOREALISTIC 3D — YOUR OWN KEY</div>
    <div class="d-text"><p>Paste a Google Maps Platform API key with the <b>Map Tiles API</b> enabled, and the globe switches to Google's photorealistic 3D cities and terrain. OSM buildings are hidden while it is on.</p></div>
    <form id="ms-form" class="form-grid" autocomplete="off">
      <label class="full">GOOGLE MAPS API KEY
        <input name="key" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="${o.hasStoredKey ? 'Saved in this browser — paste a new key to replace it' : 'AIza…'}" />
      </label>
      <div class="full btn-row">
        <button type="submit" class="chip on" id="ms-save">SAVE &amp; LOAD 3D TILES</button>
        ${o.photoreal.active
          ? html`<button type="button" class="chip" id="ms-off">TURN GOOGLE 3D OFF</button>`
          : o.hasStoredKey || o.envKey || o.ionToken
            ? html`<button type="button" class="chip" id="ms-on">TURN GOOGLE 3D ON</button>`
            : ''}
        ${o.hasStoredKey ? html`<button type="button" class="chip" id="ms-remove">REMOVE MY KEY</button>` : ''}
      </div>
      <div class="full muted" id="ms-status" role="status">STATUS: ${google}</div>
    </form>

    <div class="section-label">GETTING A KEY</div>
    <ol class="d-text steps">
      <li>Open the <a href="https://console.cloud.google.com/google/maps-apis/" target="_blank" rel="noopener">Google Maps Platform console</a> and create or pick a project. Google asks for a billing account.</li>
      <li>Enable the <a href="https://console.cloud.google.com/apis/library/tile.googleapis.com" target="_blank" rel="noopener">Map Tiles API</a>.</li>
      <li>Create an API key under <b>Keys &amp; Credentials</b>. Restrict it to the Map Tiles API and to this site's address (HTTP referrer).</li>
      <li>Paste it above. Check Google's <a href="https://developers.google.com/maps/documentation/tile/usage-and-billing" target="_blank" rel="noopener">current pricing and free usage limits</a>.</li>
    </ol>
    <p class="caveat">Your key is stored only in this browser (localStorage) and sent only to Google's tile server (tile.googleapis.com). It is never uploaded anywhere else. Anyone who uses this browser profile could read it, so remove it on shared computers. If you host your own copy, you can set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env</code> instead.</p>`;
  const el = modal('3D MAP', content, { wide: false });
  const status = el.querySelector('#ms-status');
  const busy = (msg) => {
    status.textContent = `STATUS: ${msg}`;
    for (const b of el.querySelectorAll('#ms-form button')) b.disabled = true;
  };
  const failMessage = (error) => {
    const m = String(error?.message || error || '');
    if (/40[013]/.test(m)) return 'Google refused the key (check that the Map Tiles API is enabled and the key restrictions allow this site).';
    if (/429/.test(m)) return 'Google says the key is over its quota.';
    return 'Could not load Google 3D tiles with this key.';
  };

  el.querySelector('#ms-osm').addEventListener('click', () => {
    o.onBuildings(!o.buildingsOn);
    o.reopen();
  });
  el.querySelector('#ms-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.key.value.trim();
    if (!key) return toast('Paste a key first');
    if (!/^[\w-]{20,60}$/.test(key)) return toast("That doesn't look like a Google API key");
    busy('Loading Google 3D tiles…');
    const r = await o.onSaveKey(key);
    toast(r.ok ? 'Google photorealistic 3D is on — zoom into a city' : failMessage(r.error), r.ok ? 2600 : 6000);
    o.reopen();
  });
  el.querySelector('#ms-remove')?.addEventListener('click', async () => {
    busy('Removing key…');
    await o.onRemoveKey();
    toast('Key removed from this browser');
    o.reopen();
  });
  el.querySelector('#ms-on')?.addEventListener('click', async () => {
    busy('Loading Google 3D tiles…');
    const r = await o.onPhotoreal(true);
    if (!r.ok) toast(failMessage(r.error), 6000);
    o.reopen();
  });
  el.querySelector('#ms-off')?.addEventListener('click', async () => {
    await o.onPhotoreal(false);
    o.reopen();
  });
}

/* ── "What did I see?" checker ───────────────────────────── */
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compassOptions = (selected) =>
  POINTS.map((p, i) => html`<option value="${i * 22.5}" ${selected === i * 22.5 ? 'selected' : ''}>${p}</option>`);

export function openExplain(o) {
  const p = o.prefill || {};
  const when = p.date ? new Date(p.date) : new Date();
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const content = html`
    <h2>What did I see?</h2>
    <p class="lead">Describe the sighting and the app checks the ordinary explanations it can: planets, bright stars and the Moon, satellites (for the last three weeks), rocket launches, and the wind for lanterns and balloons.</p>
    <form id="ex-form" class="form-grid">
      <label>DATE &amp; TIME <span class="dim">(your time zone)</span><input name="date" type="datetime-local" required value="${local}" /></label>
      <label>WHAT IT DID<select name="motion">${Object.entries(o.motions).map(([k, v]) => html`<option value="${k}" ${p.motion === k ? 'selected' : ''}>${v}</option>`)}</select></label>
      <label>LATITUDE<input name="lat" type="number" step="any" min="-90" max="90" required value="${o.lat.toFixed(4)}" /></label>
      <label>LONGITUDE<input name="lon" type="number" step="any" min="-180" max="180" required value="${o.lon.toFixed(4)}" /></label>
      <label>DIRECTION YOU LOOKED<select name="az"><option value="">Not sure</option>${compassOptions(p.az)}</select></label>
      <label>HEIGHT IN THE SKY<select name="alt"><option value="">Not sure</option>${Object.entries(o.heights).map(([k, v]) => html`<option value="${v.alt}">${v.label}</option>`)}</select></label>
      <label>IT WAS MOVING TOWARD<select name="toward"><option value="">Not sure / didn't move</option>${compassOptions(null)}</select></label>
      <fieldset class="full ex-looks"><legend>HOW IT LOOKED</legend>
        <label><input type="checkbox" name="bright" /> Very bright</label>
        <label><input type="checkbox" name="blinking" /> Blinking or flashing</label>
        <label><input type="checkbox" name="colours" /> Changing colours</label>
        <label><input type="checkbox" name="orange" /> Orange, flickering</label>
      </fieldset>
      <div class="full btn-row">
        <button type="button" class="chip" id="ex-geo">⌖ USE MY LOCATION</button>
        <button type="submit" class="chip on">CHECK IT</button>
      </div>
    </form>
    <div id="ex-results" aria-live="polite"></div>`;
  const el = modal('WHAT DID I SEE?', content, { wide: false });
  const form = el.querySelector('#ex-form');
  el.querySelector('#ex-geo').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocation unavailable');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.lat.value = pos.coords.latitude.toFixed(4);
        form.lon.value = pos.coords.longitude.toFixed(4);
        toast('Location set');
      },
      () => toast('Location permission denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
  const results = el.querySelector('#ex-results');
  let runId = 0;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const when = new Date(f.get('date'));
    if (Number.isNaN(when.getTime())) return toast('Check the date and time');
    const num = (k) => (f.get(k) === '' || f.get(k) == null ? null : Number(f.get(k)));
    const input = {
      date: new Date(f.get('date')).toISOString(),
      lat: Number(f.get('lat')),
      lon: Number(f.get('lon')),
      report: {
        az: num('az'),
        alt: num('alt'),
        towardAz: num('toward'),
        motion: f.get('motion'),
        bright: f.get('bright') === 'on',
        blinking: f.get('blinking') === 'on',
        colours: f.get('colours') === 'on',
        orange: f.get('orange') === 'on',
      },
    };
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon)) return toast('Check the coordinates');
    mount(results, html`<div class="loading-line">Checking the sky, satellites, launches and wind…</div>`);
    // A second press starts a new check; only the latest one may show its results.
    const id = ++runId;
    let r;
    try {
      r = await o.run(input);
    } catch (error) {
      if (id !== runId) return;
      console.warn('[explain]', error);
      mount(results, html`<p class="caveat">The check failed: ${String(error?.message || error)}. Please try again.</p>`);
      return;
    }
    if (id !== runId) return;
    const top = r.candidates.slice(0, 6);
    mount(
      results,
      html`<div class="section-label" style="margin-top:14px">MOST LIKELY</div>
        <ol class="ex-list">${top.map(
          (c) => html`<li class="ex-${c.score >= 0.6 ? 'strong' : c.score >= 0.35 ? 'possible' : 'weak'}">
            <div class="ex-head"><b>${c.name}</b><span class="badge">${o.label(c.score)}</span></div>
            <div class="ex-bar"><i style="width:${Math.round(c.score * 100)}%"></i></div>
            <p>${c.reason}</p></li>`,
        )}</ol>
        <p class="caveat">Checked: ${r.checked.join(' · ')}.${r.notes.length ? ` ${r.notes.join(' ')}` : ''} A match means an ordinary object was in the right place at the right time; it doesn't prove that's what you saw.</p>
        <div class="btn-row"><button type="button" class="chip on" id="ex-log">+ LOG THIS SIGHTING</button></div>`,
    );
    results.querySelector('#ex-log').addEventListener('click', () => o.onLog(input, top[0]));
    results.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

/* ── Compare two cases ───────────────────────────────────── */
function caseFacts(c) {
  const uap = (c.tracks || []).find((t) => t.kind === 'uap');
  const st = uap ? trackStats(uap) : null;
  let light = '—';
  try {
    light = skyAt(c.lat, c.lon, c.date).light + (c.timeApprox ? ' (time approx.)' : '');
  } catch {
    /* ignore */
  }
  return {
    c,
    year: new Date(c.date).getUTCFullYear(),
    score: evidenceScore(c.evidence, (c.tracks || []).length > 0),
    shapes: shapeClasses(c.shape).map((k) => SHAPES[k].label),
    light,
    length: st?.length ?? null,
    speed: st?.avgSpeedKmh ?? null,
    alt: st ? st.maxAlt * 3.281 : null,
    duration: st?.duration ?? null,
  };
}

function bar(value, max, fmt) {
  if (value == null) return html`<span class="dim">no path</span>`;
  const w = max ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return html`<div class="cmp-bar"><i style="width:${w}%"></i></div><span class="cmp-val">${fmt(value)}</span>`;
}

export function openCompare({ a, cases, onOpen }) {
  const others = cases.filter((c) => c.id !== a.id).sort((x, y) => x.title.localeCompare(y.title));
  const preferred = others.find((c) => c.category === a.category && (c.tracks || []).length) || others[0];
  const render = (b) => {
    const A = caseFacts(a);
    const B = caseFacts(b);
    const max = (k) => Math.max(A[k] ?? 0, B[k] ?? 0);
    const row = (label, fa, fb) => html`<tr><th>${label}</th><td>${fa}</td><td>${fb}</td></tr>`;
    const evidence = (F) => html`${F.c.evidence.map((e) => html`<span class="badge">${EVIDENCE[e]?.label || e}</span>`)}`;
    return html`
      <table class="cmp-table">
        <thead><tr><th></th><th><a href="#/case/${A.c.id}" data-open="${A.c.id}">${A.c.title}</a></th><th><a href="#/case/${B.c.id}" data-open="${B.c.id}">${B.c.title}</a></th></tr></thead>
        <tbody>
          ${row('WHEN', `${A.year} · ${A.light}`, `${B.year} · ${B.light}`)}
          ${row('WHERE', A.c.place, B.c.place)}
          ${row('STATUS', STATUS[A.c.status]?.label, STATUS[B.c.status]?.label)}
          ${row('TYPE', CATEGORY[A.c.category] || A.c.category, CATEGORY[B.c.category] || B.c.category)}
          ${row('SHAPE', A.c.shape || '—', B.c.shape || '—')}
          ${row('WITNESSES', A.c.witnesses || '—', B.c.witnesses || '—')}
          ${row('DURATION', A.c.duration || '—', B.c.duration || '—')}
          ${row('EVIDENCE', html`<b>${A.score}/10</b> ${evidence(A)}`, html`<b>${B.score}/10</b> ${evidence(B)}`)}
          ${row('PATH LENGTH', bar(A.length, max('length'), (v) => `${v.toFixed(v < 10 ? 1 : 0)} km`), bar(B.length, max('length'), (v) => `${v.toFixed(v < 10 ? 1 : 0)} km`))}
          ${row('AVG SPEED', bar(A.speed, max('speed'), (v) => `${Math.round(v).toLocaleString()} km/h`), bar(B.speed, max('speed'), (v) => `${Math.round(v).toLocaleString()} km/h`))}
          ${row('MAX ALTITUDE', bar(A.alt, max('alt'), (v) => `${Math.round(v).toLocaleString()} ft`), bar(B.alt, max('alt'), (v) => `${Math.round(v).toLocaleString()} ft`))}
          ${row('PATH TIME', A.duration != null ? formatDuration(A.duration) : '—', B.duration != null ? formatDuration(B.duration) : '—')}
          ${row('EXPLANATION', A.c.explanation || STATUS[A.c.status]?.long, B.c.explanation || STATUS[B.c.status]?.long)}
        </tbody>
      </table>
      <p class="caveat">Speeds and altitudes come from the reconstructed UAP paths and are only as good as the reports behind them.</p>`;
  };
  const content = html`
    <h2>Compare cases</h2>
    <label class="cmp-pick">COMPARE WITH
      <select id="cmp-select">${others.map((c) => html`<option value="${c.id}" ${c.id === preferred.id ? 'selected' : ''}>${c.title} (${new Date(c.date).getUTCFullYear()})</option>`)}</select>
    </label>
    <div id="cmp-body">${render(preferred)}</div>`;
  const el = modal('COMPARE', content);
  const body = el.querySelector('#cmp-body');
  el.querySelector('#cmp-select').addEventListener('change', (e) => mount(body, render(cases.find((c) => c.id === e.target.value))));
  body.addEventListener('click', (e) => {
    const link = e.target.closest('[data-open]');
    if (!link) return;
    e.preventDefault();
    closeModal();
    onOpen(link.dataset.open);
  });
}
