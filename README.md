<div align="center">

# 👁 God's Eye // UAP

### A UAP-only edition of [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view): every well-documented UFO/UAP encounter on a 3D globe, with reconstructed flight paths, the official U.S. government footage and files, and reference imagery of each place.

![The globe with curated case files (cyan/amber) and official U.S. releases (magenta)](docs/media/globe.jpg)

</div>

---

## What it does

| | |
|---|---|
| 🌍 **3D globe, no keys needed** | CesiumJS with Esri satellite imagery and keyless terrain (OSM fallback). Add a Google Maps or Cesium ion key for photorealistic 3D cities. |
| 🛸 **65 curated case files** | Documented cases from 1561 to 2024 on every continent, each with evidence tags, witnesses, timeline, status (unresolved / disputed / explained / identified) and the official or best-supported explanation. Examples: Kenneth Arnold, Washington 1952, the RB-47, Socorro, Rendlesham, Tehran 1976, JAL 1628, the Belgian wave, the Phoenix Lights, the Nimitz "Tic Tac", Gimbal/GoFast, Aguadilla and the 2023 shoot-downs. |
| ✈️ **Flight paths you can replay** | 3D tracks at altitude for the UAP *and* the witness aircraft, interceptors, cars and balloons. Each has drop lines, a ground track and labelled waypoints. Playback runs on a real clock with a scrubber, speed control and a chase camera. Every track states its basis (radar, official report, witness reports, flight plan or approximate). |
| 🎞 **Official U.S. footage** | All 174 UAP videos and images the Department of War / AARO have published on DVIDS, including the 2026 **PURSUE** releases from war.gov/UFO. They play inside the app. Region-only releases are drawn as rings, not fake pins. |
| 🗂 **Project Blue Book on the map** | 10,096 of the 10,763 scanned U.S. Air Force case files (1947–1969), geocoded offline. Click a point to read the original document and its OCR text. |
| 📸 **Reference images & video** | Archived photos, films and audio (e.g. the Trent photos, the Halt memo and tape, FLIR1). **Photos taken near each site** come from geotagged Wikimedia Commons. One-click Google satellite, Street View, Google Earth 3D and OpenStreetMap links, plus a ground-view fly-in. |
| 👥 **80,000 civilian reports** | NUFORC reports as a density layer (unverified, narratives removed). |
| 🛰 **Live sky check** | About 10,000 Starlink, ISS and bright satellites propagated live from CelesTrak, showing what is overhead right now. Satellites explain many modern reports. |
| 📓 **Log your own sighting** | Stored in your browser, exportable as GeoJSON, with links to report officially (NUFORC, AARO, GEIPAN). |
| 🎛 **God's Eye look** | NVG, FLIR white-hot, FLIR Ironbow and CRT sensor modes (keys `1`–`5`), tactical HUD, year histogram with brush filter, "sweep through history" and a guided tour. |
| 📚 **Government files library** | PURSUE, AARO, ODNI, NASA, NARA's UAP Records Collection, hearings, Blue Book, Sign/Grudge, Robertson, Condon, FBI Vault, CIA and AAWSAP, plus the UK MoD files, France's GEIPAN, Brazil and Australia. Public-domain PDFs are linked directly. |

<table><tr>
<td><img src="docs/media/flight-path.jpg" alt="Phoenix Lights reconstructed path with playback" /></td>
<td><img src="docs/media/nimitz-flir.jpg" alt="Nimitz Tic Tac in FLIR mode with the official FLIR1 video" /></td>
</tr><tr>
<td><img src="docs/media/blue-book.jpg" alt="A Project Blue Book case file opened from the map" /></td>
<td><img src="docs/media/civilian-reports-ironbow.jpg" alt="NUFORC civilian reports in Ironbow thermal mode" /></td>
</tr><tr>
<td><img src="docs/media/gov-files.jpg" alt="Government files library" /></td>
<td align="center"><img src="docs/media/mobile.jpg" alt="Phone layout" width="220" /></td>
</tr></table>

## Quick start

```bash
git clone https://github.com/domw99/Gods-Eye-UAPs.git
cd Gods-Eye-UAPs
npm ci
npm run dev        # http://localhost:5173
```

Optional upgrades: copy `.env.example` to `.env` and fill in the keys below.

| Key | What it adds |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Google Photorealistic 3D Tiles (needs the Map Tiles API enabled) |
| `VITE_CESIUM_ION_TOKEN` | Cesium World Terrain, plus Google 3D Tiles through ion |

Restrict browser keys to your domain at the provider.

**Deep links:**
- `#/case/nimitz-tic-tac-2004` — a curated case
- `#/official/1007777` — an official release (DVIDS id)
- `#/bluebook/1952-07-7273984-Tremonton-Utah-1377-` — a Blue Book file
- `?mode=nvg` — start in a sensor mode
- `?layers=bluebook,nuforc` — start with extra layers on

**Keyboard:**
- `1`–`5` sensor modes
- `/` search
- `[` `]` previous / next case
- `Space` play or pause the flight path
- `T` tour
- `G` government files
- `L` log a sighting
- `H` hide the HUD
- `Esc` close

## Data pipeline

All data ships in `public/data/` and is rebuilt by scripts:

| Command | Source | Output |
|---|---|---|
| `npm run sync:official` | [DVIDS](https://www.dvidshub.net/unit/AARO) search → each asset page (title, date, description, duration, thumbnail). Regions are resolved by `src/data/regions.js` | `official-uap-media.json` |
| `npm run build:bluebook` | Internet Archive collection [`project-blue-book`](https://archive.org/details/project-blue-book), geocoded offline with [GeoNames](https://www.geonames.org/) cities1000 | `bluebook.json` |
| `npm run build:nuforc` | [planetsig/ufo-reports](https://github.com/planetsig/ufo-reports) (geocoded NUFORC) — facts only | `nuforc.json` |
| `npm run verify:media` | Checks every Commons file, Wikipedia title, DVIDS id and Blue Book id the case files reference | — |
| `npm test` | Vitest: case-file integrity (coordinates, taxonomy, monotonic track times, plausible altitudes), region resolver, Blue Book parser, dataset schemas | — |

Curated cases live in `src/data/cases/*.js`. Track points are written as `p(lat, lon, altitudeFeet, secondsFromStart, note)`. Add a case, run `npm run verify:media && npm test`, and it appears on the globe.

## How to read the map honestly

- **Status matters.** Many famous cases have mundane explanations: Roswell (Project Mogul), Phoenix Lights (A-10s and flares), Hudson Valley (Cessna formation), Aguadilla (AARO: objects drifting at wind speed). They are included with the explanation shown first. "Unresolved" means insufficient data, not "alien".
- **Paths are reconstructions.** They are built from the cited reports and radar accounts, and each track states its basis. Average speeds are simple distance ÷ time between reported points.
- **Official releases are often region-only.** The magenta ring is the whole area named in the release.
- **Blue Book pins mark the town in the file name**, not the exact sighting spot.
- **NUFORC reports are unverified.** They show where people report things.

## Project structure

```
src/
  app/        viewer.js (globe, imagery, terrain, 3D tiles) · effects.js (NVG/FLIR/CRT shaders)
  data/       cases/ (curated case files) · govFiles.js · regions.js · taxonomy.js · items.js
  layers/     items.js (case & release markers) · tracks.js (flight paths + playback)
              points.js (Blue Book / NUFORC) · satellites.js (live SGP4)
  services/   wiki.js (Wikipedia summaries, Commons media & geosearch)
  ui/         list.js · dossier.js · timeline.js · modals.js
scripts/      sync-dvids.mjs · build-bluebook.mjs · build-nuforc.mjs · verify-media.mjs
tests/        Vitest suites
docs/SPEC.md  the full product spec (the improved prompt this was built from)
```

## Deploy

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on every push to `main`. Enable it under **Settings → Pages → Source: GitHub Actions**. CI (`ci.yml`) runs the tests and a build on every push and pull request.

## Credits & licences

- **Code:** MIT (see [LICENSE](LICENSE)). The visual language follows [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu (MIT). The shaders here are original.
- **Globe:** [CesiumJS](https://cesium.com/platform/cesiumjs/) (Apache-2.0).
- **Map data:**
  - Imagery: Esri World Imagery ("Powered by Esri")
  - Terrain: Re:Earth / Mapterhorn (CC BY 4.0)
  - OSM fallback: © OpenStreetMap contributors
- **Media & sources:**
  - Official footage: DVIDS / U.S. Department of War (public domain)
  - Media: Wikimedia Commons (the licence and author of each file are shown in the app)
  - Summaries: Wikipedia (CC BY-SA)
  - Blue Book scans: Internet Archive / NARA
- **Other data:**
  - Geocoding: GeoNames (CC BY 4.0)
  - Civilian reports: NUFORC via planetsig
  - Satellites: CelesTrak

Third-party data keeps its own licence; the MIT licence covers only the code.

This project presents evidence and official assessments. It does not claim that any case is extraterrestrial.
