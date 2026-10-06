# Data sources

Everything God's Eye // UAP shows comes from a public source. The code is MIT-licensed; **the data is not**. Each source below keeps its own terms, so read them before you reuse or redistribute anything, and check [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the code libraries.

There is no backend. A source is either **built** (a script fetches it ahead of time and the result ships in `public/data/`), or **live** (the visitor's browser calls it directly). The app needs **no accounts or API keys**; the optional keys are listed at the end.

## What the case files are

The 161 curated case files (`src/data/cases/`) are written for this project. Each cites its sources, and every status ("explained", "disputed", "unresolved"…) says what the cited evidence supports, not what anyone believes. The facts, dates and coordinates come from the sources linked on each case; the wording is original. The [open data](https://domw99.github.io/Gods-Eye-UAPs/open-data/) files are released under the MIT licence; the pages, media and archives they link to keep their own.

## Built into the repository (rebuilt by scripts)

| Data | Source | Terms | Script | Refreshed |
|---|---|---|---|---|
| Official U.S. releases (titles, dates, descriptions, thumbnails, video ids) | [DVIDS](https://www.dvidshub.net/unit/AARO) (AARO and the Department of War) | U.S. government works, public domain | `npm run sync:official` | Weekly (`sync-official.yml`) |
| Project Blue Book case files (about 10,000, with places found from file names) | [Internet Archive `project-blue-book`](https://archive.org/details/project-blue-book), scans of National Archives microfilm T1206 | U.S. government records, public domain | `npm run build:bluebook` | On demand |
| Places for Blue Book, MUFON and journal pages | [GeoNames](https://www.geonames.org/) cities1000 and the France dump | CC BY 4.0 | `scripts/lib/` | With the builds above |
| GEIPAN case and testimony files (about 2,700 placed cases, 1937–2018) | [GEIPAN / CNES](https://www.cnes-geipan.fr/fr/recherche/cas) published CSV (the export dates from February 2019) | GEIPAN's published open data | `npm run build:geipan` | On demand |
| NUFORC reports (about 80,000, facts only: date, place, shape, duration) | [planetsig/ufo-reports](https://github.com/planetsig/ufo-reports), a geocoded copy of [NUFORC](https://nuforc.org/) | Facts only; the narratives are removed. Unverified civilian reports | `npm run build:nuforc` | On demand |
| MUFON Journal and Skylook: places, page numbers and short quotes (485 issues, 1967–2008) | [The MUFON Archive on the Internet Archive](https://archive.org/details/MUFON_UFO_Journal_-_Skylook), OCR text | CC BY-NC-ND 4.0 as published there. Only places, page numbers and short quotes are stored (e-mail addresses and phone numbers in them are removed: `scripts/lib/redact.mjs`); the pages are read from the Internet Archive | `npm run build:mufon` | On demand |
| Research journals: APRO Bulletin, NICAP's U.F.O. Investigator, CUFOS's International UFO Reporter, MUFON chapter newsletters (873 issues) | Scans on the Internet Archive | Each remains its publisher's. Only places, page numbers and short quotes are stored, with e-mail addresses and phone numbers removed | `npm run build:journals` | On demand |
| Search index for those journals (the words of about 22,000 pages, no text) | Built from the two builds above | — | `npm run build:textindex` | After them |
| U.S. special-use airspace (restricted, warning, MOA, alert, prohibited) | [FAA special-use airspace](https://geospatial.faa.gov/) (ArcGIS open data), simplified | U.S. government data, public domain | `npm run build:airspace` | On demand |
| Geomagnetic Kp index, every three hours since 1932 (about 277,000 values, packed in a 277 KB file) | [GFZ Helmholtz Centre for Geosciences, Potsdam](https://kp.gfz.de/en/data) (Matzka et al. 2021, DOI 10.1029/2020SW002641) | CC BY 4.0. Credit GFZ Potsdam when you reuse it | `npm run build:kp` | Monthly (`sync-official.yml`) |
| Airports and airfields (about 11,000: large and medium airports, small ones with an ICAO code or scheduled flights, and military fields by name) | [OurAirports](https://ourairports.com/data/) | Public domain. It shows what exists now, not what existed at the time of a case | `npm run build:airfields` | On demand |
| The Moon: places and landing sites, the 2,048-pixel copy of the global mosaic | Positions from NASA's NSSDC table and the IAU Gazetteer; mosaic from NASA's Lunar Reconnaissance Orbiter Camera (LROC) via [NASA Moon Trek](https://trek.nasa.gov/moon/) | NASA imagery is generally public domain; see NASA's media usage guidelines | by hand | With the Moon data |
| Space & Moon pictures | A Moon photograph by Gregory H. Revera ([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), via Wikimedia Commons), cropped and resized | CC BY-SA 3.0 | by hand | — |
| Night sky | [NASA Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851) (NASA/Goddard SVS), as six cube faces | NASA, public domain | `scripts/build-skybox.py` | — |

## Called live from the visitor's browser

| What | Service | Terms |
|---|---|---|
| Satellite imagery | [Esri World Imagery](https://services.arcgisonline.com/) ("Powered by Esri"). The OpenStreetMap fallback is © OpenStreetMap contributors | Esri's terms for the public services; OSM under the [ODbL](https://www.openstreetmap.org/copyright) |
| Terrain | [Re:Earth](https://terrain.reearth.land/) / Mapterhorn | CC BY 4.0 |
| 3D buildings | [OpenFreeMap](https://openfreemap.org/) vector tiles, from © OpenMapTiles and © OpenStreetMap contributors | ODbL and the OpenMapTiles licence |
| City lights on the night side, and the Earth on the day of a case | NASA GIBS (Black Marble 2016; MODIS Terra corrected reflectance) | NASA, public domain |
| The Moon (when the shipped copy is not enough) | NASA Moon Trek tiles: LROC global mosaic and the LOLA colour-shaded relief | NASA, generally public domain |
| Case summaries on the globe | [Wikipedia](https://www.wikipedia.org/) REST API | CC BY-SA 4.0 |
| Photographs and video | [Wikimedia Commons](https://commons.wikimedia.org/) (the licence and author of each file are shown in the app) | Per file |
| Official videos | DVIDS embeds | Public domain |
| Scans | Internet Archive embeds and page text | Per item |
| Live satellite positions | [CelesTrak](https://celestrak.org/) TLEs, propagated on the device with SGP4 | CelesTrak's terms: free for this use; please do not hammer it |
| Rocket launches | [Launch Library 2](https://thespacedevs.com/llapi) (free tier, rate-limited) | The Space Devs' terms; the app caches and backs off |
| Weather at the time of a sighting | [Open-Meteo](https://open-meteo.com/) archive and forecast APIs | CC BY 4.0, free for non-commercial use |
| Earthquakes in the last 24 hours | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/) | U.S. government data, public domain |
| Place search | [Photon](https://photon.komoot.io/) (OpenStreetMap data, © OpenStreetMap contributors) | Fair use; the app waits for you to stop typing |
| Sky at the time (Sun, Moon, planets, bright stars) | Computed on the device with [astronomy-engine](https://github.com/cosinekitty/astronomy) | — |
| Fonts | Google Fonts (Inter, JetBrains Mono) | SIL Open Font Licence |

## What is stored on your device

Nothing leaves your browser. `localStorage` holds your language, your starred cases, your own sighting log, which panels were open, your map choices and the optional keys below. Clear the site's data to remove all of it.

## Optional keys (never required)

| Key | Where it goes | What it adds |
|---|---|---|
| Google Maps Platform key (Map Tiles API) | The in-app **MAP** panel, or `VITE_GOOGLE_MAPS_API_KEY` at build time | Photorealistic 3D Tiles |
| Cesium ion token | The MAP panel, or `VITE_CESIUM_ION_TOKEN` | Cesium World Terrain; Google 3D Tiles through ion |

A key entered in the panel stays in your browser. A key built into a deployed site is public to every visitor: restrict it to your domain.

## Accuracy

These sources disagree, and some are wrong. Place names in the MUFON and research archives are found automatically from OCR text and can name a witness's hometown instead of the sighting. NUFORC reports are unverified. GEIPAN's file is from 2019. Flight paths are reconstructions and say what they are based on. See [How to read the map honestly](README.md#how-to-read-the-map-honestly) and [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md). Corrections are welcome: every case has a **Suggest a correction** button.
