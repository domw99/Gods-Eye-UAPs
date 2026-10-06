# Known issues and limits

Check here before filing an issue. Some of these are fixable, some are the nature of the data.

## The app

- **WebGL is required.** The globe needs a browser with WebGL 2 and hardware acceleration. Without it the page says so. On very old phones the Earth is drawn at reduced resolution (see the frame-rate readout, <kbd>`</kbd>).
- **Map imagery needs the network.** The satellite imagery, terrain, buildings and place names come from Esri, Re:Earth and OpenFreeMap. Offline you get the case list, dossiers and the dark globe from what the service worker saved; tiles you have not seen are missing. The Moon keeps working offline from a 2,048-pixel copy of NASA's mosaic.
- **Some networks block live feeds.** Corporate and school networks sometimes block CelesTrak (live satellites), Launch Library 2 (launches), USGS (earthquakes) or Photon (place search). The layer says *offline* and everything else keeps working. The sighting checker says which checks it could not make.
- **Launch Library 2 is rate-limited** (a few calls an hour on its free tier). The app caches and backs off; "Launch Library limit reached" means wait.
- **Safari and Firefox.** Both work, but Safari's private mode restricts storage (your starred cases and log are not kept) and Firefox draws the sensor looks a little slower on integrated graphics.
- **Printing is not designed.** Use the share card or the open data instead.
- **Left-to-right layout.** Arabic text reads right to left inside the panels, but the panels keep their sides.

## The data

- **Flight paths are reconstructions.** Seventy cases draw one. Each says what it is based on (radar, an official report, witness reports, a flight plan, or `approximate`), and an approximate path is drawn from descriptions, not measurements.
- **Times can be approximate.** Fifty-two older cases record only a date or part of a day (*time approx.*). The sky, the weather and the story say so, and the day/night lighting uses the best guess.
- **Positions follow the sources**, and are only as exact as the case's *precision* (`site`, `city`, `area`, `region`).
- **Blue Book places come from file names.** About 10,000 case files are placed at the town named in the file, which is not always where the sighting happened. Files that name no town are not placed.
- **GEIPAN's export is from 2019.** Newer cases are on GEIPAN's own site.
- **NUFORC reports are unverified**, and the dataset is a geocoded copy with the narratives removed. Many are ordinary aircraft, planets or satellites.
- **MUFON and research-archive places are found automatically** from OCR text. A pin can be a witness's hometown or where a report was filed. OCR errors mean some pages are missed and some words are wrong.
- **Journal search needs two or more less-common words.** Very common words are on too many pages to narrow a search, and the box says so.
- **Airspace is U.S. only** (FAA special-use airspace). A case elsewhere is not checked against airspace.
- **Night-side city lights are today's.** When a case lights the globe for its moment, the lights come from NASA's 2016 Black Marble, not the lights of the case year.
- **The Moon's places are approximate.** Landing sites match NASA's table; the other names are within about a degree of the IAU Gazetteer values.

## Reporting something new

Open a [bug report](https://github.com/domw99/Gods-Eye-UAPs/issues/new?template=bug_report.yml) with your browser, device and what you did. For a wrong fact in a case, use **Suggest a correction** in the app and cite the source.
