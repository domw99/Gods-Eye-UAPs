# God's Eye // UAP — product spec (the improved prompt)

This is the brief this repository was built from. It started as:

> *"I want a version of God's Eye that is only for UAPs around the world. I want it
> to show where the UAPs have been seen, show their flight path, and much more. I want
> it to have the reference images and videos from online that show that's the place
> where the UAPs have been seen."* — plus: *"pretty much every UAP encounter with
> proof, including the USA UFO gov files"*, with
> [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) as the
> reference.

Rewritten as a precise, buildable prompt:

---

**Build "God's Eye // UAP": a UAP-only edition of God's Eye View.** It is a browser-based
3D globe for Unidentified Anomalous Phenomena that maps every well-evidenced encounter
worldwide, reconstructs how the objects moved, and puts the original evidence (photos,
video, radar data, government files) next to each location.

## 1. Look and feel (match God's Eye View)
- CesiumJS globe on Vite. It starts **without API keys** using Esri World Imagery and
  keyless terrain, with OpenStreetMap as the fallback. Google Photorealistic 3D Tiles and
  Cesium World Terrain are optional via `.env` keys.
- Dark glass tactical UI with a tactical HUD: UTC clock, camera coordinates, altitude,
  current target and a crosshair.
- Sensor modes as GLSL post-processing: Normal, NVG, FLIR white-hot, FLIR Ironbow and CRT.
  Keys `1`–`5` switch between them.

## 2. Data layers — "every UAP encounter with proof"
1. **Curated case files.** Documented encounters from 1561 to today on every continent,
   limited to cases with evidence: radar, sensor video, film or photos, official
   documents, physical traces, medical effects, or many independent credible witnesses.
   Each case carries:
   - date and time with the local UTC offset, coordinates, and a location precision
     (site / city / area / region)
   - shape, witnesses, duration, a timeline, and evidence tags
   - status (unresolved / disputed / explained / identified / unassessed), with the
     official or best-supported explanation whenever one exists
   - a Wikipedia reference, media (Wikimedia Commons, DVIDS, Internet Archive) and
     sources
2. **Official U.S. government footage.** Every UAP video and image the Department of War
   and AARO publish on DVIDS for the 2026 PURSUE releases (war.gov/UFO) and earlier AARO
   and Navy releases. A sync script keeps it current.
   - Releases usually name only a region. Show that region as a ring, never a false pin.
3. **Project Blue Book.** The U.S. Air Force case files (1947–1969; about 10,700
   scanned files) as a point layer.
   - Geocode each file offline from its file name.
   - Each point opens the scanned original and its OCR text.
4. **Civilian reports.** About 80,000 NUFORC reports as a density layer, with narratives
   removed and a clear "unverified" label.
5. **Live satellites.** Starlink, the ISS and bright satellites propagated live from
   CelesTrak (SGP4). A "sky check" lists what is above a location right now.
6. **My sightings.** Visitors can log their own sighting (stored in the browser,
   exportable as GeoJSON). The form links to NUFORC, AARO and GEIPAN for official
   reporting.

## 3. Flight paths
- Reconstruct paths from the cited reports as time-stamped 3D tracks: longitude,
  latitude, altitude and time, with an optional note per point. Tracks can be the UAP,
  the witness aircraft, interceptors, ships, vehicles, balloons or meteors.
- Render each track as:
  - a glowing polyline at altitude
  - a dashed ground track
  - vertical drop lines and labelled waypoints
  - observer and witness positions, with related sites such as radar stations and bases
- Playback runs on the Cesium clock: play/pause, scrubber, speed control, a trailing
  path, and a chase camera.
- Label every track with its basis (radar, official report, witness reports, flight
  plan, analyst reconstruction or approximate illustration). Show the derived stats:
  distance, duration, maximum altitude and average speed.

## 4. Dossier (click any record)
- Official video players, archived photos, audio (e.g. the Halt tape) and PDFs, each
  with its licence and author from Commons.
- **Reference imagery of the place:**
  - present-day geotagged Commons photos taken near the coordinates, with distance to
    the site
  - one-click Google satellite, Street View, Google Earth 3D and OpenStreetMap links
  - an in-globe "ground view" fly-in
- Wikipedia summary, a timeline, the assessment, sources, a share link and deep links
  (`#/case/<id>`, `#/official/<dvidsId>`, `#/bluebook/<id>`).
- For cases from 1947–1970: Blue Book files from the same month within 150 km.

## 5. Navigation and extras
- Search, evidence and status filters, sorting, and layer toggles with live counts.
- Year histogram with a brush selection. Blue Book and NUFORC appear as overlays, with a
  "sweep through history" animation.
- Guided tour of landmark cases.
- **Government Files library:**
  - U.S.: PURSUE, AARO, ODNI, NASA, NARA's UAP collection, hearings, Blue Book,
    Sign/Grudge, Robertson, Condon, FBI Vault, CIA, AAWSAP
  - other countries: UK MoD, France GEIPAN, Brazil, Australia
  - civilian: NUFORC
- Keyboard shortcuts, a responsive phone layout (bottom sheets), and accessible
  controls.

## 6. Integrity rules
- Never invent media: every Commons file, Wikipedia title, DVIDS ID and Blue Book
  identifier is verified by `npm run verify:media`.
- Present official assessments and skeptical explanations next to witness claims. Don't
  claim anything is extraterrestrial.
- Mark approximate locations and reconstructed paths as such.
- Attribute every third-party source. Ship facts only from NUFORC, no narratives.

## 7. Engineering
- Data pipelines:
  - `sync:official` — DVIDS
  - `build:bluebook` — Internet Archive + GeoNames
  - `build:nuforc`
  - `verify:media`
- Vitest suites check data integrity (valid coordinates, taxonomy, monotonic track
  times, plausible altitudes) plus the region resolver and the Blue Book parser.
- CI runs the tests and build. GitHub Pages deploys from `main`.
