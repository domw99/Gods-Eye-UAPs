import { html, mount, safeUrl, toast } from '../util/dom.js';
import { GOV_FILES } from '../data/govFiles.js';
import { commonsPage } from '../services/wiki.js';

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
  });
  backdrop.querySelector('.modal button, .modal input, .modal a')?.focus();
  return backdrop;
}

export function openGovFiles(stats, officialUnplaced = []) {
  const groups = [...new Set(GOV_FILES.map((f) => f.group))];
  const content = html`
    <h2>Government UFO / UAP files</h2>
    <p class="lead">Primary sources from the U.S. government and others. Official videos are on the globe (magenta), Project Blue Book case files are a map layer (amber), and every link below opens the original archive.</p>
    <div class="stat-row">
      <div class="stat"><div class="v">${stats.cases}</div><div class="k">CURATED CASE FILES</div></div>
      <div class="stat"><div class="v">${stats.official}</div><div class="k">OFFICIAL U.S. RELEASES</div></div>
      <div class="stat"><div class="v">${stats.bluebook}</div><div class="k">BLUE BOOK FILES</div></div>
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
      )}</div>`,
    )}
    ${officialUnplaced.length
      ? html`<div class="section-label" style="margin-top:18px">OFFICIAL RECORDS WITHOUT A LOCATION (${officialUnplaced.length})</div>
        <ul class="source-list">${officialUnplaced.map(
          (o) => html`<li><span class="badge official">${o.type === 'video' ? 'VIDEO' : 'IMAGE'}</span><a href="#/official/${o.dvidsId}">${o.title}</a></li>`,
        )}</ul>`
      : ''}`;
  modal('GOV FILES', content);
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
      <p><b style="color:#ff7a45">Civilian reports</b> — ~80,000 NUFORC reports (1906–2014), unverified, narratives removed.</p>
      <p><b style="color:#7dd3ff">Live satellites</b> — current Starlink, ISS and bright-satellite positions from CelesTrak, to check what is overhead now.</p>
    </div>
    <div class="section-label">DATA SNAPSHOT</div>
    <div class="d-text"><p>Official catalogue synced ${meta.officialGenerated?.slice(0, 10) || '—'} · Blue Book layer built ${meta.bluebookGenerated?.slice(0, 10) || '(loads on demand)'}. Refresh with <code>npm run sync:official</code>, <code>npm run build:bluebook</code> and <code>npm run build:nuforc</code>.</p></div>
    <div class="section-label">KEYBOARD</div>
    <dl class="d-kv"><dt>1 – 5</dt><dd>Sensor modes: Normal, NVG, FLIR, Ironbow, CRT</dd><dt>/</dt><dd>Search</dd><dt>[ ]</dt><dd>Previous / next case</dd><dt>SPACE</dt><dd>Play / pause flight path</dd><dt>T</dt><dd>Guided tour</dd><dt>G</dt><dd>Government files</dd><dt>L</dt><dd>Log a sighting</dd><dt>H</dt><dd>Hide HUD</dd><dt>ESC</dt><dd>Close</dd></dl>
    <div class="section-label">CREDITS</div>
    <div class="d-text"><p>Visual language after <a href="https://github.com/bilawalsidhu/gods-eye-view" target="_blank" rel="noopener">God’s Eye View</a> by Bilawal Sidhu (MIT). Globe: CesiumJS. Imagery: Esri World Imagery (Powered by Esri). Terrain: Re:Earth / Mapterhorn (CC BY 4.0). Geocoding: GeoNames (CC BY 4.0). Media: Wikimedia Commons (licences shown per file), DVIDS (public domain), Internet Archive. Summaries: Wikipedia (CC BY-SA). Satellites: CelesTrak.</p>
    <p class="caveat">This console presents evidence and official assessments; it does not claim any case is extraterrestrial. Many famous cases have mundane explanations, and those are shown alongside the reports.</p></div>`;
  modal('ABOUT', content, { wide: false });
}

export function openLogForm({ lat, lon, onSave }) {
  const now = new Date();
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
      <label class="full">WHAT HAPPENED<textarea name="description" maxlength="4000" placeholder="Direction of travel, altitude/angle, sound, colour, how it left…"></textarea></label>
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
      date: new Date(f.get('date')).toISOString(),
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
