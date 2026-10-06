# Changelog

What changed in each release of God's Eye // UAP, newest first. This file is generated from [`.github/release-notes/`](.github/release-notes) by `npm run build:changelog`; the same notes are the text of each [GitHub release](https://github.com/domw99/Gods-Eye-UAPs/releases).

## [1.7] — 2026-10-03

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.7)

**Easier to find and easier to share: every case file can be found in search engines, shared in one click, and downloaded as open data.**

**Share in one click**

**⇪ SHARE** on any case still makes its card: an image of the globe at the case, with its status and evidence score. On a phone it opens the phone's share sheet. On a computer it now opens a share dialog with:
- the card;
- one-click posts to **X, Reddit, Bluesky, Facebook, WhatsApp, Telegram, LinkedIn and email**, with the case's title and link filled in;
- the link to copy, and the image to save.

**About** (<kbd>?</kbd>) has the same links for sharing the app itself. Everything is translated into all 15 languages.

**Open data**

All 161 case files can be downloaded from the new [open data page](https://domw99.github.io/Gods-Eye-UAPs/open-data/), free under the MIT licence:
- [`cases.json`](https://domw99.github.io/Gods-Eye-UAPs/open-data/cases.json): every field, including the 70 reconstructed flight paths and what each is based on.
- [`cases.csv`](https://domw99.github.io/Gods-Eye-UAPs/open-data/cases.csv): one row per case, for spreadsheets.
- [`cases.geojson`](https://domw99.github.io/Gods-Eye-UAPs/open-data/cases.geojson): a point per case and a 3D line per flight path, for GIS tools and web maps.

The page describes the data in the schema.org Dataset format, so dataset search engines can list it.

**Found by search engines**
- **Case pages can now be indexed.** Every case page used to send its visitor straight on to the globe, so search engines took all 161 for redirects to the front page and indexed none of them. Now only links shared from the app go straight to the globe; they end in `#globe`, and links shared before this release open the case page, one click from the globe. Anyone arriving from a search reads the case page: its summary, explanation, sources and similar cases, with **Open on the 3D globe** at the top.
- **A list of all case files** ([`case/`](https://domw99.github.io/Gods-Eye-UAPs/case/)), by decade, that works without a 3D globe. It's linked from the case list's small print and from About.
- **Structured data** on the front page (the site, the app and the dataset) and on every case page (the article, with the place, date and sources, and its breadcrumb). The sitemap now lists the new pages, and each deploy still sends it to Bing and the other IndexNow engines.
- **Wayback Machine copies:** after each deploy, the Internet Archive is asked to keep a copy of the front page, the case list and the open data page.

**Fixes**
- The card on each case page was squashed sideways; it keeps its shape now.
- The small print on the case pages was below the contrast that screen accessibility asks for.
- On a slow connection, the service worker could show the app at a case page's address. Only the app itself now falls back to the copy it keeps.

## [1.6] — 2026-10-03

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.6)

**The Moon gets map symbols of its own, like the Earth's layers. This release also fixes a round of bugs and translates the labels that were still in English.**

**Symbols on the Moon**

Every place on the Moon map now has a symbol in the same style as the Earth's archives: a dark backdrop, a glowing outline and a colour for each kind of place. The same symbols appear on the globe, in the list of places and in the layer switches. The pins in the Space & Moon dialog match them.

- **A flag** for each of the six crewed Apollo landings.
- **A lander** for each of the 18 robotic landings.
- **A starburst** where Luna 2 struck in 1959. It used to be called a landing site; it now reads IMPACT SITE, and the Apollo sites read CREWED LANDING.
- **Waves** for the seas, **rings** for the great basins, a **rim and central peak** for the craters, and **peaks** for the mountains and valleys.
- **A glowing numbered ring** for each lunar report.

Symbols come and go with their names as you zoom. The landing sites and reports show from afar and shrink as you back away, so the whole Moon stays readable on a phone. Apollo 12 and Surveyor 3, and Apollo 11 and Surveyor 5, would sit on top of each other from afar, so they are drawn apart there and return to their true places as you close in.

**Fixes on the Moon map**
- **Reports at the same place stand side by side.** Aristarchus has three (2, 4 and 5), and their pins used to sit on top of each other, so report 5's pin there could not be seen.
- **Symbols at the rim are drawn whole.** The edge of the globe no longer cuts them in half.
- **Places past the rim are hidden completely.** Before, half a name could poke out into space, such as a lone "Mare" beside the Moon.
- **The search box's hint fits.** It no longer ends in a cut-off "(".

**Other fixes**
- **Translations:**
  - About 60 labels that were still in English in the other 15 languages are now translated, including:
    - the hover labels on the globe (groups of markers, Blue Book, GEIPAN, MUFON, satellites, airspace, earthquakes and launch sites)
    - the airspace rows
    - the journal-search notes
    - the Blue Book and civilian report titles
    - the satellite sky-check line
    - the image viewer
    - the map's data attribution box
    - the screen-reader labels of the sky chart and statistics
  - Counts take the right plural form in every language.
- **Loading:**
  - A layer that fails to load no longer stops the other layers from loading.
  - Switching the earthquake layer quickly on and off fetches the feed only once.
- **Near me** keeps its place name when you add the civilian reports. It used to read the name back from the page title, which broke in other languages.
- **On the Moon,** <kbd>M</kbd> opens the map settings, as the MAP button does.
- **Screen readers:** the case panel's collapse button says whether the panel is open.

## [1.5] — 2026-10-02

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.5)

**Thirteen more case files, 161 in all, from the 1913 Great Meteor Procession to the 2024 drones over the U.S. air bases in England.**

**New cases**

Each has its sources, a timeline and a status that says what is documented, what is only claimed and what explanation is on offer. Seven come with a reconstructed path, marked as approximate.

- **The Great Meteor Procession, 1913.** Forty to sixty slow fireballs crossed Canada, the northeastern United States and Bermuda on one path. *Explained:* a small, short-lived natural satellite breaking up (Clarence Chant). Its path is drawn from Saskatchewan to Bermuda.
- **Clyde Tombaugh's sighting, Las Cruces, 1949.** The man who found Pluto saw six to eight rectangles of light. *Disputed:* he later thought a reflection from an inversion layer most likely.
- **Kirtland Air Force Base, 1957.** Two tower controllers saw an egg-shaped object, and approach radar tracked a target for about 20 minutes. *Explained* by Project Blue Book and the Condon Report as a light aircraft.
- **Deception Island, Antarctica, July 1965.** Argentine, Chilean and British stations saw a coloured, manoeuvring light, and the Argentine Navy issued a statement. *Unresolved.* It is the first case in Antarctica, so cases now come from 33 countries and territories.
- **The Paulding Light, Michigan.** *Explained:* headlights on U.S. 45, shown by Michigan Tech students with a telescope in 2010.
- **Wurtsmith Air Force Base, 1975.** A low "helicopter" over the weapons storage area and a KC-135 tanker crew that chased an object over Lake Huron. *Unresolved.*
- **Four airliners:** Alitalia over Kent (1991), Air France 3532 (1994, a French government file), British Airways 5061 near Manchester (1995) and Aerolíneas Argentinas 674 at Bariloche, the night the city lost its lights (1995). All *unresolved*.
- **Three drone waves:** north-eastern Colorado (2019–20, *disputed*), Langley Air Force Base (2023) and the U.S. bases in England (2024), both *unresolved*.

**Also new**
- **Journal pages for the new cases.** The MUFON journal now discusses 92 of the 161 cases, and the APRO, NICAP and CUFOS archives 98. Matching is sharper too: a case can name the phrase the journals use for it, so "Deception Island" no longer matches every *Messengers of Deception*.
- **Share cards for every new case,** with the satellite view behind the path. A new **Share cards** workflow (`cards.yml`) draws cards on GitHub and commits them, so adding a case no longer needs a local browser.
- **A "what's new" note** for returning visitors, once, for this version (translated into all 15 languages).

This release also carries the Moon beside the Earth (**EARTH | MOON** in the top bar), described in the 1.4 notes.

## [1.4] — 2026-10-02

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.4)

**The Moon beside the Earth, in the same layout, links to Space & Moon reports, and a sweep for bugs.**

▶ [Watch what's new in 1.3 and 1.4 (34 s)](https://github.com/domw99/Gods-Eye-UAPs/releases/download/v1.4/whats-new-1.4.mp4)

**New**
- **The Moon, beside the Earth.** **EARTH | MOON** at the left of the top bar (or <kbd>U</kbd>) switches between the two worlds. It also opens from the Moon tab of Space & Moon, or with a link such as `#/moon/apollo-17`. The Moon is a globe on its own ellipsoid that turns and zooms like the Earth, from the whole Moon down to about a kilometre above the surface, and it is laid out like the Earth: the same top bar, a list of places on the left with search, layers and sorting, a dossier on the right, the HUD, and the zoom and reset controls.
  - **NASA's pictures:** the Lunar Reconnaissance Orbiter Camera mosaic at 100 metres to the pixel, from NASA Moon Trek. The **Relief** layer lays the laser altimeter's colour-coded heights over it. A low-resolution copy ships with the app, so the Moon still turns offline.
  - **Layers:** lunar reports, landing sites, seas and basins, craters, and mountains and valleys, each on or off on the globe and in the list. There are **89 named places**, labelled as you zoom in, and **25 landing and impact sites**, from Luna 2 and the Surveyors through Apollo 11 to 17 and Chang'e 3 to 6 to Chandrayaan-3, SLIM and IM-1, each with its date and landing time.
  - **The lunar reports as numbered pins**, the same as in Space & Moon. They include the far-side one the photograph couldn't show (Giordano Bruno, for Gervase of Canterbury in 1178). Each place and report opens a dossier: for a report, its assessment, summary, NASA files and sources.
  - **Lit by the Sun of the moment.** With the lighting on **AUTO**, a landing site is lit as the Sun stood at the landing (Apollo 11 touched down with the Sun 10.7° up, and the dossier says so). A report with a known night is lit for that night. **DAY**, **NIGHT** (earthshine) and **OFF** work as on the Earth.
  - **The sensor looks** (NVG, FLIR, Ironbow, CRT, Noir, Snow) work on the Moon too.
  - Arrow keys turn the Moon, <kbd>+</kbd> <kbd>−</kbd> zoom, <kbd>0</kbd> or <kbd>R</kbd> resets, <kbd>N</kbd> hides the names, <kbd>[</kbd> <kbd>]</kbd> step through the list, and <kbd>Esc</kbd> closes the dossier, then returns to the Earth. On a phone the list is a bottom sheet that folds away, as on the Earth.
  - The Earth stops drawing while the Moon is showing, and the Moon's video memory is released when you switch back.
- **Links to Space & Moon.** `#/space`, `#/space/<tab>` and `#/space/<report>` open the dialog on that tab, scrolled to the report. **⧉ COPY LINK** on a card copies it.
- **A "what's new" note** for returning visitors, once, for this version (translated into all 15 languages).

**Faster to open on a slow connection**
- The installed app and the website now show the copy they saved after five seconds without an answer from the network, and save the late answer for next time.

**Fixed**
- **A link with a stray `%` in it** (a cut-off or hand-typed address such as `#/case/%`) stopped the app from starting. It now opens the app, and the part it can't read is left as it is.
- A damaged entry in the saved sighting log no longer discards the whole log.

## [1.3] — 2026-10-02

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.3)

**Space & Moon, ten more cases, and a pass for the keyboard and screen readers.**

**New**
- **Space & Moon** (**SPACE & MOON** in the top bar, or <kbd>K</kbd>). Reports from beyond the atmosphere, with what was reported, what is documented and the best explanation for each:
  - **In orbit:** the Mercury "fireflies", Gemini 4, Gemini 7's "bogey", Apollo 11 and 17, the Apollo "light flashes", STS-48 and STS-75.
  - **The Moon:** Gervase of Canterbury (1178), Herschel (1787), Kozyrev at Alphonsus (1958), Greenacre and Barr at Aristarchus (1963), the Apollo crews' flashes and NASA's brightest recorded impact flash (2013), on a photograph of the near side with numbered pins.
  - **Deep space:** the "Face on Mars", the "Wow!" signal, 'Oumuamua and 3I/ATLAS.
  - The NASA files from the 2026 PURSUE releases (Mercury, the Apollo debriefings, Cooper's 1962 interview) are listed with the reports they bear on, and open in the app.
- **10 more cases (148 in all, 33 countries),** to widen the map beyond North America and the Cold War: the Wonsan and Sunchon B-29s (1952), Quarouble (1954), the Vilas-Boas claim (1957), Coyame (1974), Cussac (1967), the Broad Haven schoolchildren (1977), Zanfretta (1978), Ilkley Moor (1987), the airline sightings over Ireland (2018) and American 2292 (2021).
- **Source links for the 12 cases that had none,** and a share card for every case, so a pasted link previews the right picture for all 148.
- **Similar cases** at the end of each case file.
- **`?lang=` links:** add `?lang=es`, `?lang=ja` and so on to open the app in a language.
- **Journal coverage refreshed:** 87 of the 148 cases now list MUFON journal pages that discuss them, and 92 list pages from the APRO, NICAP and CUFOS archives.

**Layers**
- Live satellites, rocket launches, military airspace and 3D buildings now have symbols of their own in the layer list (a satellite, a rocket, an airspace cylinder, a tower) instead of a plain dot.
- The MUFON files row showed "485 issues" until it loaded, and then the number of places. It now shows the number of mapped places from the start, like the other archive layers.

**Keyboard and screen readers**
- A skip link, labelled regions for the globe, the readout and the map controls, and a navigation group that was marked with the wrong role.
- Dialogs keep the keyboard inside them and make the page behind inert. Opening a case from the list with Enter moves the focus into it, and Escape returns it to the row.
- The loading screen's small print is readable, and the faded loading screen is hidden from screen readers.
- The browser tests now run an automated accessibility check (axe) on the start screen, a case file and the dialogs.

**Fixed**
- Case links for the 22 newest cases previewed the default image on X, Reddit and Discord. They now have their own cards.

## [1.2] — 2026-10-02

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.2)

**Every language, a one-tap install, and 12 more cases.**

**New**
- **16 languages.** English, Español, Français, Deutsch, Português, Italiano, Nederlands, Polski, Türkçe, Русский, العربية (right to left), हिन्दी, Bahasa Indonesia, 日本語, 한국어 and 中文. Pick one from the top bar, or let the app follow your browser. Buttons, filters, panel headings, the sky, weather and launch lines and the messages are translated; case texts and archive quotations stay as published.
- **Save it as an app.** On a phone, **⤓ INSTALL APP** installs it in one tap where the browser allows it, and otherwise shows the steps for your browser. It opens full screen, respects the notch and home bar, and keeps working offline for what you have already looked at.
- **Day / night / off in the top bar.** A four-button lighting switch (auto, day, night, off) next to the sensor modes: no trip into settings.
- **Hide the years bar** (**HIDE**, or <kbd>Y</kbd>) and bring it back with **▲ YEARS**. The panels grow into the space and the choice is remembered.
- **A symbol for every layer.** Blue Book is a file, GEIPAN a shield, MUFON a hexagon, the research archives an open book, civilian reports a spark, in the same style as the case rings and official diamonds, in the map and in the layer list.
- **Earthquakes layer** (USGS, last 24 hours), sized and coloured by magnitude, with a file for each quake. Strong quakes are sometimes reported as booms or odd lights.
- **Noir and Snow sensor looks** (keys <kbd>6</kbd> and <kbd>7</kbd>), after the original God's Eye View. <kbd>`</kbd> shows the frame rate.
- **12 more cases (138 in all):** the Delphos ring (1971), Pascagoula (1973), the Coyne helicopter (1973), Loring AFB (1975), La Joya, Peru (1980), Boianai, Papua (1959), Dalnegorsk "Height 611" (1986), the Knowles family at Mundrabilla (1988), the Mexico City eclipse videos (1991), Chile's 2014 Navy helicopter video, the Ubatuba magnesium (1957) and Maury Island (1947).

**Changed**
- 3D buildings are off by default. Turn them on under **MAP**, in the layer list, or with **Fly to ground view**.

**Fixed**
- The map controls (zoom, reset) slid to the middle when a case file opened and did not return when it closed. They now follow the dossier at every window size, and the same fix covers the top bar growing and shrinking with the window.
- Grouped markers no longer blink or jump while the globe turns.
- Safe-area gaps on phones with a notch; a more compact phone top bar.

A 23-second video of what is new, `whats-new-1.2.mp4`, is attached.

## [1.1] — 2026-09-27

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.1)

**Sharper, smoother, and a real sky.**

A 21-second video of what's new, `whats-new-1.1.mp4`, is attached below.

**Looks better**
- **The stars are real:** NASA's Deep Star Maps 2020 behind the globe, 1.7 billion stars from Hipparcos, Tycho and Gaia in their true positions.
- **Sharp at any zoom:** still views render at your screen's full resolution, and imagery loads finer tiles.
- **Sharp sensor modes:** NVG, FLIR, Ironbow and CRT no longer blur the picture, so labels stay readable. The thermal modes show a cold-to-hot scale.
- **Night lighting** with NASA's city lights, and brighter moonlit coasts.

**New**
- **That day from orbit:** for cases since 2000, NASA's satellite picture of the whole Earth that day, clouds and all, laid over the globe. For example, O'Hare 2006 under the overcast the witnesses described.
- **Map styles:** Satellite, Dark, Streets or Topographic, and place names and borders over the satellite map.
- **Lighting:** Auto (the moment of the case), Day, Night or Off. Press <kbd>D</kbd> to cycle.
- **Clean view** (<kbd>F</kbd>), **slow orbit** (<kbd>O</kbd>), and **arrow keys** to fly (<kbd>Shift</kbd> to turn and tilt).
- **Star cases** to keep your own list, a **⚄ Random** case button, and a short start card for first-time visitors.

**Smoother**
- Zooming out stays centred and levels the view, so the globe ends up in the middle.
- Hovering no longer re-renders the scene on every mouse move. Fast devices never resize the canvas, and the first hover no longer stalls. In a profile of typical use, time lost to long tasks fell by about two thirds.
- Phones load a lighter copy of the star sky, a quarter of the memory.
- If your system asks for reduced motion, the camera cuts instead of flying and the sensor grain holds still.

**Fixes**
- Quotes and page text from the scanned journals and Blue Book files no longer show the OCR's line-break mark mid-word ("Switzer¬ land"), and the journal search now finds words the scans had split across two lines.
- Deleting a logged sighting asks on the button itself instead of in a browser pop-up.

## [1.0] — 2026-09-26

[Release page](https://github.com/domw99/Gods-Eye-UAPs/releases/tag/v1.0)

**Every well-documented UFO/UAP encounter on a 3D globe, with the evidence.**

It runs in the browser with nothing to install, no sign-up and no API keys. It can also be installed as an app.

**What's in 1.0**

- **126 curated cases** from 1561 to 2024. Each one has:
  - a flight path you can replay, and the basis for it (radar, official report, witness reports or approximate);
  - the official or best-supported explanation shown first, including for the cases that were solved;
  - a 0–10 evidence score.
- **The files, on the map:**
  - 174 official U.S. releases (AARO / PURSUE footage via DVIDS);
  - 10,096 Project Blue Book files;
  - all 2,768 cases from France's GEIPAN, with its A–D findings;
  - 485 MUFON Journal issues;
  - 872 issues of the APRO, NICAP and CUFOS journals and the MUFON chapter newsletters.
- **22,000 journal pages** searchable by word, in the browser.
- **Checks for each case:** the sky at that moment (planets, bright stars, satellites), the weather, military airspace and rocket launches. "What did I see?" ranks likely explanations for your own sighting.
- **Ways to view it:** witness view, and Normal / NVG / FLIR / Ironbow / CRT sensor modes. Story mode for each case, and a guided tour.
- **Statistics, "Near me"** and an optional grouping of nearby markers.
- **Share cards:** each case link now previews that case on X, Reddit and Discord.

Corrections are welcome: every case has a "suggest a correction" link.

It is a UAP edition of Bilawal Sidhu's open-source [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT).
