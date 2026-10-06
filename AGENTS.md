# Working on God's Eye // UAP

A guide for anyone changing this repository, people and coding agents alike. [CONTRIBUTING.md](CONTRIBUTING.md) is the shorter version for first-time contributors; the [README](README.md) describes the product.

## What it is

A static web app (no backend, no accounts, no API keys): a CesiumJS 3D globe of 161 documented UFO/UAP cases with reconstructed flight paths, the official U.S. and French files, the MUFON and research-archive journals, tools to check a sighting against the sky, weather and airspace, and a globe of the Moon. Vanilla JavaScript (ES modules), Vite, CesiumJS. It is built to be read: a case says what is documented, what is only claimed, and what the best explanation is.

## Commands

| Command | Does |
|---|---|
| `npm ci` | Install exactly what `package-lock.json` says |
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm run build` | Production build into `dist/` (also writes a page per case, the case index, the open data and `sitemap.xml`) |
| `npm run preview` | Serve `dist/` at http://localhost:4173 (what the browser tests use) |
| `npm test` | Vitest, about 800 tests, a few seconds. Run it before every commit |
| `npm run e2e` | Playwright browser tests (desktop and phone), about 15 minutes. Needs `npx playwright install chromium` once, and a build first |
| `npm run verify:media` | Checks the Commons files, Wikipedia titles, DVIDS ids and Blue Book ids the case files cite. Run it after editing a case |
| `npm run data` | Rebuilds every dataset in `public/data/` from its source (slow, network) |
| `npm run build:changelog` / `build:notices` | Regenerate `CHANGELOG.md` / `THIRD_PARTY_NOTICES.md`. Tests fail when they are stale |
| `npm run i18n:add strings.json` | Add interface strings to all 15 language files (see below) |

## Where things are

The README's "How it works" table and project structure list every module. The ones you will touch most:

- `src/main.js`: the app's wiring (layers, selection, dialogs, keys, hash routes). It is large on purpose; most logic is in the modules it calls.
- `src/data/cases/*.js`: the curated cases. `helpers.js` has `p(lat, lon, altFt, seconds, note)` for flight-path points, `commons()`, `dvids()`, `link()`.
- `src/ui/*.js`: the list, dossier, dialogs, timeline, story mode, Moon panel. `src/layers/*.js`: what is drawn on the globe. `src/services/*.js`: sky, weather, airspace, launches, journals.
- `src/i18n/`: `index.js` (the API) and `locales/*.js` (15 generated dictionaries).
- `scripts/`: dataset builders and the build-time page generators (`lib/case-pages.mjs`, `lib/open-data.mjs`). `vite.config.js` calls them.
- `tests/` (Vitest) and `e2e/` (Playwright). `window.__uap` is the debug hook the browser tests use.

## Conventions

- **No keys, no backend.** Anything live is fetched from a keyless public API straight from the browser, with a timeout and a visible "offline" state when it fails. A new data source goes in [DATA_SOURCES.md](DATA_SOURCES.md) with its terms.
- **Honesty first.** A case's `status` says what its evidence supports. An approximate flight path says `basis: 'approximate'`. Never present a guess as a fact; say "approx." in the interface.
- **Interface text is English, and the English string is the key.** Wrap text built in code in `t('…')`; use `t('{n} things', { n })` for values, `th()` for HTML with escaped values (`raw()` for HTML values) and `plural(n, '{n} thing', '{n} things')` for counts. Text in `index.html` or in `html\`\`` templates is translated by a DOM pass when its whole trimmed text is a key. Every key must exist in all 15 language files; `tests/i18n.test.js` checks every `t()`/`th()`/`toast()` string in `src/`. Add translations with `npm run i18n:add strings.json` (the format is in the header of `scripts/add-strings.mjs`).
- **Map symbols** are drawn from the shapes in `src/layers/glyphs.js`; add a shape there and use `glyphUrl()` / `glyphSvg()` instead of a new image.
- **Rendering on demand.** The Earth and Moon viewers render only when something changes (`requestRenderMode`); call `scene.requestRender()` after changing an entity from code.
- **Accessibility is tested.** Controls need an accessible name and a visible focus; dialogs trap focus and close on Esc; colour contrast is checked by axe in `e2e/`. Text must be at least 4.5:1 against its background.
- **Pages are static HTML.** The case, index and open-data pages (`scripts/lib/`) have their own inline styles and no scripts beyond one redirect. Keep them that way.
- Small functions, comments that say why, no dependencies added lightly (the bundle is already large because of Cesium; check `THIRD_PARTY_NOTICES.md` after a change).

## Adding or changing a case

See [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-case). Then `npm run verify:media && npm test`. The share card for a new case is drawn on GitHub: run the **Share cards** workflow (`cards.yml`) from the Actions tab and it commits `public/cards/<id>.jpg`.

## Making a release

1. Add `.github/release-notes/vX.Y.md` (a one-line bold summary, then the changes).
2. Set `RELEASE` in `src/config.js` to `X.Y`, and replace the toast in `maybeWelcome()` (`src/main.js`) with one sentence about what is new, translated into all languages. Returning visitors see it once.
3. `npm run build:changelog`, and `npm run build:notices` if dependencies changed.
4. Update the README (counts, features, pictures) and `docs/` where needed.
5. Commit, push, wait for **CI** and **Deploy to GitHub Pages**, then run the **Release** workflow with the tag (`vX.Y`) and a title. It publishes the notes and attaches `docs/media/demo.mp4`, `whats-new-X.Y.mp4` and `share-card.jpg` when they exist. Run it again on an existing tag to refresh its notes.

## Workflows (`.github/workflows/`)

`ci.yml` (tests, build, browser tests on every push), `pages.yml` (deploy), `sync-official.yml` (weekly DVIDS sync), `links.yml` (weekly check of every cited link; opens an issue), `indexnow.yml` (tells Bing and others about the sitemap and asks the Wayback Machine for a copy after each deploy), `cards.yml` (share cards), `release.yml`, `codeql.yml`.

## Things that have bitten before

- `public/sw.js` serves pages network-first and a case page must not fall back to the app: only the app's own address does. Test service-worker changes in `tests/sw.test.js`.
- A case page redirects to the globe only when its link ends in `#globe`; otherwise search engines treat every page as a redirect to the front page.
- Cesium's own labels (the data-attribution box) are built after the page is translated; each globe calls `translateDom()` once it exists.
- Markers skip the depth test only out to the horizon (`src/app/horizon.js`, and the Moon's `updateFacing`); skipping it everywhere draws far-side markers through the globe.
- Keep `npm test` fast. Anything slow or network-bound belongs in `e2e/` or a script.
