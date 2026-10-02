import { link } from './cases/helpers.js';

/**
 * Space and Moon: reports from beyond the atmosphere. What astronauts and
 * cosmonauts have said they saw from orbit, what astronomers have seen on the
 * Moon, and a few distant objects that are discussed as possible technology.
 * Most have a natural explanation; each entry says what was reported, what is
 * documented and what explanation is on offer, in the same way as the case
 * files on the globe.
 *
 *   zone   'orbit' | 'moon' | 'deep'
 *   year   for sorting
 *   when   the date as it is shown
 *   moon   [{ lat, lon, label }] selenographic positions (east longitudes
 *          positive), drawn on the near-side map
 *   earth  { lat, lon, note } where the spacecraft was, for a fly-to on the globe
 *   official  DVIDS ids of the NASA files in the 2026 PURSUE releases; they open
 *          in the app like any other official record
 */
export const SPACE_ZONES = ['orbit', 'moon', 'deep'];

export const SPACE = [
  // ── In orbit ──────────────────────────────────────────────
  {
    id: 'mercury-fireflies',
    zone: 'orbit',
    year: 1962,
    when: 'Feb 1962 – May 1963',
    title: 'Mercury “fireflies” and particles',
    where: 'In low Earth orbit, four Mercury flights',
    status: 'explained',
    summary:
      'Several Mercury flights reported small, bright particles drifting past the capsule. On the first American orbital flight, in February 1962, John Glenn called them “fireflies”. In May 1962 Scott Carpenter said white particles “look exactly like snowflakes” and some seemed to move faster than his capsule. In October 1962 Wally Schirra described “little white objects that tend to come from the capsule itself and drift off”, and Gordon Cooper saw “John’s fireflies” again in May 1963. Cooper also told Walter Cronkite in 1962 that many well-qualified people had seen objects for which there was no logical explanation.',
    explanation:
      'NASA later determined that the “fireflies” were frozen condensation separating from the spacecraft, lit by the Sun. Some of those on Cooper’s flight appeared after he released beacons, which carry xenon strobe lights.',
    official: [1007879, 1007877, 1007874, 1007876, 1010337],
    sources: [link('Wikipedia — Mercury-Atlas 6', 'https://en.wikipedia.org/wiki/Mercury-Atlas_6')],
  },
  {
    id: 'gemini-4',
    zone: 'orbit',
    year: 1965,
    when: 'Jun 4, 1965',
    title: 'Gemini 4 — McDivitt’s “cylindrical object”',
    where: 'Over Hawaii, in low Earth orbit',
    status: 'disputed',
    summary:
      'On June 4, 1965 James McDivitt, command pilot of Gemini 4, saw an object while the spacecraft passed over Hawaii and filmed and photographed it. He described “a cylindrical object — it was white — it had a long arm that stuck out on the side”, and said he could not tell whether it was a small object close by or a large one far away, because there was nothing to judge by.',
    explanation:
      'The upper stage of the Titan II rocket was proposed. McDivitt rejected that, because during the first orbit his own task had been to fly formation with that stage and he knew what it looked like. He believed that he had seen some unidentified but man-made piece of orbital debris.',
    earth: { lat: 21, lon: -157, note: 'over Hawaii' },
    sources: [
      link('UFOs at close sight — NASA photographs of unidentified objects, Gemini IV, 1965', 'https://ufologie.patrickgross.org/htm/gemini465.htm', 'analysis'),
      link('UFO Evidence — The Gemini 4 sighting, with a sceptical analysis', 'http://www.ufoevidence.org/cases/case978.htm', 'analysis'),
    ],
  },
  {
    id: 'gemini-7',
    zone: 'orbit',
    year: 1965,
    when: 'Dec 4, 1965',
    title: 'Gemini 7 — “a bogey at ten o’clock high”',
    where: 'In low Earth orbit, 4 h 24 min into the flight',
    status: 'unresolved',
    summary:
      'About four and a half hours after launch, Frank Borman reported to Houston: “We have a bogey at ten o’clock high.” Mission control asked whether it was the booster or a natural sighting, and Borman answered that there was debris and that this was an actual sighting. James Lovell separately described the Titan II booster, at two o’clock, as “a brilliant body in the sun against a black background with trillions of particles on it”. In the transcript, the bogey is a third object, distinct from both the booster and the particles. The tape was among the NASA files released with the 2026 PURSUE releases.',
    explanation: 'No explanation has been published. The transcript treats the bogey as a separate object from the booster.',
    sources: [
      link('DECUR — Gemini 7 “bogey” tape, transcript (NARA RG 255)', 'https://decur.org/documents/255-gemini-7-bogey-transcript-1965', 'analysis'),
      link('Wikipedia — Gemini 7', 'https://en.wikipedia.org/wiki/Gemini_7'),
    ],
  },
  {
    id: 'apollo-11-outbound',
    zone: 'orbit',
    year: 1969,
    when: 'Jul 1969',
    title: 'Apollo 11 — the object on the way to the Moon',
    where: 'Translunar coast, about a day out from the Moon',
    status: 'explained',
    summary:
      'On the way to the Moon, Buzz Aldrin saw an object of some size, and the crew looked at it through a monocular. They asked Houston whether it was the spent Saturn S-IVB stage and were told that the stage was some 6,000 miles away. Seen through the monocular the object looked a little like an L, “like an open suitcase”; with the sextant out of focus it looked like a cylinder. The crew also saw small objects drifting by during propellant dumps.',
    explanation:
      'Flight controllers concluded that the observations were probably the S-IVB stage, the four spacecraft–lunar-module adapter panels that moved away when the lander was extracted, or smaller objects.',
    sources: [link('NASA — Apollo 11 technical crew debriefing', 'https://www.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11tcdb.html')],
  },
  {
    id: 'apollo-17-particles',
    zone: 'orbit',
    year: 1972,
    when: 'Dec 7, 1972',
    title: 'Apollo 17 — “jagged, angular” particles',
    where: 'Translunar coast, near the S-IVB stage',
    status: 'explained',
    summary:
      'During the last crewed Apollo mission, Gene Cernan, Harrison Schmitt and Ronald Evans reported small lights outside the spacecraft on the way to the Moon. They described bright particles or fragments, “jagged” and “angular”, drifting near the spacecraft and the separated S-IVB stage, and noted that they “twinkle” and move away from the stage.',
    explanation: 'The crew themselves guessed that the lights were paint chips or ice chips from the S-IVB stage.',
    official: [1007872],
    sources: [link('Wikipedia — Apollo 17', 'https://en.wikipedia.org/wiki/Apollo_17')],
  },
  {
    id: 'apollo-light-flashes',
    zone: 'orbit',
    year: 1969,
    when: 'Jul 1969 – Dec 1972',
    title: 'Apollo “light flashes”',
    where: 'In the dark of the cabin, on the way to and from the Moon',
    status: 'identified',
    summary:
      'Several Apollo crews reported flashes and streaks of light, mostly when they were resting in the dark. In the Apollo 12 medical debriefing Pete Conrad, Dick Gordon and Alan Bean each described them, and the NASA doctors asked whether similar flashes reported by Buzz Aldrin on Apollo 11 were due to cosmic rays striking the retina. The Apollo 14 and 17 debriefings return to the “light flash phenomena”.',
    explanation:
      'NASA determined that the flashes were internal to the astronauts’ vision, not external lights. High-energy cosmic rays crossing the eye are now a well-documented cause.',
    official: [1007870, 1014107, 1014110, 1014116, 1014117],
    sources: [link('Wikipedia — Cosmic-ray visual phenomena', 'https://en.wikipedia.org/wiki/Cosmic_ray_visual_phenomena')],
  },
  {
    id: 'sts-48',
    zone: 'orbit',
    year: 1991,
    when: 'Sep 15, 1991',
    title: 'STS-48 — the Discovery video',
    where: 'Near the west coast of Australia, in low Earth orbit',
    status: 'disputed',
    summary:
      'Between 20:30 and 20:45 GMT on September 15, 1991 a camera aboard the Space Shuttle Discovery recorded a flash of light and several small objects that seem to change direction. NASA scientists who viewed the tape said the objects were ice particles. The physicist Jack Kasher of the University of Nebraska, and the analyst Mark Carlotto, argued that their motion does not fit that explanation. Carlotto pointed out that the attitude of the shuttle did not change.',
    explanation:
      'NASA’s position is that the objects are ice particles, and that the apparent change of direction came when the shuttle’s Reaction Control System thrusters fired and their plumes pushed the nearby particles away.',
    earth: { lat: -25, lon: 111, note: 'near the west coast of Australia' },
    sources: [
      link('Wikipedia — STS-48', 'https://en.wikipedia.org/wiki/STS-48'),
      link('NICAP — Jack Kasher’s analysis of the STS-48 video', 'https://www.nicap.org/muj_kasher_sts48.htm', 'analysis'),
    ],
  },
  {
    id: 'sts-75',
    zone: 'orbit',
    year: 1996,
    when: 'Feb 26, 1996',
    title: 'STS-75 — the tether incident',
    where: 'Beyond the shuttle Columbia, in low Earth orbit',
    status: 'explained',
    summary:
      'On February 25, 1996 Columbia deployed the Tethered Satellite System. At about 01:30 GMT on February 26 the tether broke at the deployer end, and the satellite and the tether separated rapidly from the shuttle. The video of the event, which was seen live, shows many luminous objects moving around the broken tether, and it became one of the best-known “UFO” clips from space.',
    explanation:
      'The tether failed because of unforeseen pinholes in its insulation: air trapped under the cover bubbled out into the vacuum. NASA and others attribute the moving lights to orbital debris and ice particles lit by the Sun and overexposed against the dark sky.',
    sources: [
      link('Wikipedia — STS-75', 'https://en.wikipedia.org/wiki/STS-75'),
      link('Space Centre NZ — STS-75: the tether incident', 'https://www.spacecentre.nz/resources/videos/spaceflight/shuttle/columbia-sts75.html', 'analysis'),
    ],
  },

  // ── The Moon ──────────────────────────────────────────────
  {
    id: 'moon-1178',
    zone: 'moon',
    year: 1178,
    when: 'Jun 18, 1178',
    title: 'Gervase of Canterbury — “the upper horn split in two”',
    where: 'The far side, just past the limb (Giordano Bruno crater, if at all)',
    status: 'disputed',
    summary:
      'A chronicle by Gervase of Canterbury describes five or more monks seeing an upheaval on the Moon on June 18, 1178: the upper horn of the crescent split in two, and “a flaming torch sprang up” that spewed fire, hot coals and sparks, while the Moon seemed to “throb like a wounded snake”. In 1976 Jack Hartung proposed that they had seen the impact that made the crater Giordano Bruno.',
    explanation:
      'More recent studies reject that: an impact that made a 22-km crater would have caused a week-long meteor storm on Earth, and no record of one exists. Some scholars suspect the monks saw a meteor exploding in the atmosphere, by chance in line with the Moon.',
    moon: [],
    sources: [
      link('Wikipedia — Transient lunar phenomenon', 'https://en.wikipedia.org/wiki/Transient_lunar_phenomenon'),
      link('Wikipedia — Giordano Bruno (crater)', 'https://en.wikipedia.org/wiki/Giordano_Bruno_(crater)'),
    ],
  },
  {
    id: 'moon-1787',
    zone: 'moon',
    year: 1787,
    when: 'Apr 19–20, 1787',
    title: 'Herschel’s three “volcanoes”',
    where: 'Near Aristarchus, with two other spots near Menelaus and Manilius',
    status: 'disputed',
    summary:
      'On the night of April 19, 1787 the astronomer William Herschel saw three red glowing spots on the dark part of the Moon, and the next night they were still glowing, with the one near Aristarchus brighter and larger, at least five kilometres across. He took them to be erupting volcanoes and invited King George III to look through the royal telescope. His “Account of Three Volcanoes in the Moon” was read to the Royal Society on April 26.',
    explanation:
      'The cause is not settled. The reports coincided with a rare aurora seen in Padua, and a recent paper asks whether the glow was impact melt from a meteoroid of the Lyrid shower.',
    moon: [{ lat: 23.7, lon: -47.4, label: 'Aristarchus' }],
    sources: [
      link('Wikipedia — Transient lunar phenomenon', 'https://en.wikipedia.org/wiki/Transient_lunar_phenomenon'),
      link('arXiv — William Herschel’s April 1787 report of an erupting volcano on the Moon', 'https://arxiv.org/abs/1804.08716', 'analysis'),
    ],
  },
  {
    id: 'moon-1958',
    zone: 'moon',
    year: 1958,
    when: 'Night of Nov 2–3, 1958',
    title: 'Kozyrev at Alphonsus',
    where: 'Alphonsus crater, central peak',
    status: 'disputed',
    summary:
      'Using a 48-inch reflector with a spectrograph, the Soviet astronomer Nikolai Kozyrev watched the central peak of Alphonsus for about half an hour, as its colour and brightness changed, and it brightened before it faded. His spectra showed bright gaseous emission bands, which he took to be from carbon molecules (C2 and C3). It is among the best-known reports of a transient lunar phenomenon, because he recorded a spectrum and not just a colour.',
    explanation:
      'Gas escaping from beneath the surface is the usual explanation offered, but it has not been confirmed. The Lunar Prospector spacecraft did later detect radon coming from the craters Aristarchus and Kepler.',
    moon: [{ lat: -13.4, lon: -3.2, label: 'Alphonsus' }],
    sources: [
      link('Wikipedia — Alphonsus (crater)', 'https://en.wikipedia.org/wiki/Alphonsus_(crater)'),
      link('Wikipedia — Nikolai Aleksandrovich Kozyrev', 'https://en.wikipedia.org/wiki/Nikolai_Aleksandrovich_Kozyrev'),
    ],
  },
  {
    id: 'moon-1963',
    zone: 'moon',
    year: 1963,
    when: 'Night of Oct 29–30, 1963',
    title: 'Greenacre and Barr at Aristarchus',
    where: 'Aristarchus and Schröter’s Valley',
    status: 'unresolved',
    summary:
      'Two cartographers at the Lowell Observatory, James Greenacre and Edward Barr, saw very bright red, orange and pink glows near Aristarchus and Schröter’s Valley, in three places at once. The reports were written by hand and nothing was photographed, but Greenacre’s reputation as a careful observer led professional astronomers to take the whole subject more seriously. Patrick Moore coined the term “transient lunar phenomena” in a 1968 NASA report that he co-wrote.',
    explanation:
      'No agreed explanation. Outgassing, impacts, electrostatic effects and the conditions of observation (Earth’s atmosphere above all) have all been proposed.',
    moon: [{ lat: 24.2, lon: -49.5, label: 'Aristarchus / Schröter’s Valley' }],
    sources: [link('Wikipedia — Transient lunar phenomenon', 'https://en.wikipedia.org/wiki/Transient_lunar_phenomenon')],
  },
  {
    id: 'moon-apollo',
    zone: 'moon',
    year: 1969,
    when: 'Jul 1969 and Dec 1972',
    title: 'Apollo crews see flashes and a glow',
    where: 'Near Aristarchus (Apollo 11) and north of Grimaldi (Apollo 17)',
    status: 'unresolved',
    summary:
      'In July 1969 Neil Armstrong, from lunar orbit, reported that an area near Aristarchus was “considerably more illuminated than the surrounding area”, with “a slight amount of fluorescence”. In December 1972 Harrison Schmitt saw a bright flash north of Grimaldi, and Ronald Evans noted a light flash east of Mare Orientale. They are rare cases in which trained observers saw such an event close up. An Apollo 16 science debriefing also mentions an unreported “flash”.',
    explanation: 'There is no agreed explanation for any of these.',
    official: [1010319, 1010336],
    moon: [
      { lat: 23.7, lon: -47.4, label: 'Aristarchus (Apollo 11)' },
      { lat: -2.5, lon: -68.5, label: 'Grimaldi, to the north (Apollo 17)' },
    ],
    sources: [link('Wikipedia — Transient lunar phenomenon', 'https://en.wikipedia.org/wiki/Transient_lunar_phenomenon')],
  },
  {
    id: 'moon-2013',
    zone: 'moon',
    year: 2013,
    when: 'Mar 17, 2013',
    title: 'The brightest impact flash NASA has recorded',
    where: 'Mare Imbrium',
    status: 'identified',
    summary:
      'NASA’s lunar impact monitoring at Marshall Space Flight Center recorded the brightest and longest-lasting flash its telescopes have seen, in Mare Imbrium, almost ten times brighter than anything it had observed before. It was caused by a meteoroid of about 40 kilograms, 0.3 to 0.4 metres across, striking at about 56,000 mph, with the energy of some five tons of TNT. The Lunar Reconnaissance Orbiter later found the new crater, 18 metres wide, with rays of ejecta reaching several kilometres.',
    explanation:
      'This one was solved: it is an example of what an impact flash looks like, and of how a transient event can be checked against a crater photographed afterwards.',
    moon: [{ lat: 20.6, lon: -23.9, label: 'Impact site' }],
    sources: [
      link('NASA Science — Bright explosion on the Moon', 'https://science.nasa.gov/science-research/planetary-science/16may_lunarimpact/'),
      link('NASA SVS — March 17, 2013 lunar impact forms a new crater', 'https://svs.gsfc.nasa.gov/4242'),
    ],
  },

  // ── Deep space ────────────────────────────────────────────
  {
    id: 'mars-face',
    zone: 'deep',
    year: 1976,
    when: 'Jul 25, 1976',
    title: 'The “Face on Mars”',
    where: 'Cydonia Mensae, Mars (40.75° N, 9.46° W)',
    status: 'explained',
    summary:
      'On July 25, 1976 NASA’s Viking 1 orbiter photographed the region of Cydonia while looking for a landing site for Viking 2. One picture shows a mesa about two kilometres long whose shadows look like a human face. It was soon claimed to be an artificial monument, and the idea persisted for years.',
    explanation:
      'NASA scientists had already read it as an optical illusion caused by the angle of the Sun and the shapes of the surface. In April 1998 and again in 2001 the Mars Global Surveyor imaged it at much higher resolution, down to about 2 metres a pixel, and showed an ordinary hill whose face-like look depends on the viewing and lighting angle.',
    sources: [
      link('ESA — Cydonia, the face on Mars', 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express/Cydonia_-_the_face_on_Mars'),
      link('Wikipedia — Cydonia (Mars)', 'https://en.wikipedia.org/wiki/Cydonia_(Mars)'),
    ],
  },
  {
    id: 'wow-signal',
    zone: 'deep',
    year: 1977,
    when: 'Aug 15, 1977',
    title: 'The “Wow!” signal',
    where: 'Constellation Sagittarius, seen from Ohio',
    status: 'unresolved',
    summary:
      'On the night of August 15, 1977 Ohio State University’s Big Ear radio telescope picked up a narrow-band signal from the direction of Sagittarius near the 21-cm hydrogen line, at 1420 MHz, about 30 times stronger than the background. Jerry Ehman, who was going through the printout, circled it and wrote “Wow!”. It lasted the 72 seconds that the Earth’s rotation took to carry the source through the telescope’s beam. It has never been seen again, despite many searches.',
    explanation:
      'It is still unexplained. A 2017 paper suggested that a comet’s hydrogen cloud could have produced it, but SETI Institute scientists reject that, because comets do not move fast enough to cross the beam in a minute. Another suggestion is a magnetar flare striking a cold hydrogen cloud.',
    sources: [
      link('Wikipedia — Wow! signal', 'https://en.wikipedia.org/wiki/Wow!_signal'),
      link('The Planetary Society — The Wow! signal', 'https://www.planetary.org/space-images/the-wow-signal'),
      link('Breakthrough Listen — Search for the Wow! signal', 'https://seti.berkeley.edu/wow/'),
    ],
  },
  {
    id: 'oumuamua',
    zone: 'deep',
    year: 2017,
    when: 'Oct 19, 2017',
    title: '‘Oumuamua',
    where: 'Passing through the Solar System',
    status: 'disputed',
    summary:
      'The Pan-STARRS survey in Hawaii detected ‘Oumuamua on October 19, 2017: the first known interstellar object to pass through the Solar System. Its motion showed a small push, not caused by gravity, away from the Sun, with no visible coma or tail. The Harvard astronomer Avi Loeb argued that it might be a thin, light-sail-like craft pushed by sunlight, and that natural explanations each have shortcomings.',
    explanation:
      'The scientific consensus is that it is natural, though the mechanism is unsettled. Explanations offered include an iceberg of molecular hydrogen, a porous cloud of dust, a fragment torn apart by a star’s tides, and outgassing.',
    sources: [
      link('Wikipedia — ‘Oumuamua', 'https://en.wikipedia.org/wiki/%CA%BBOumuamua'),
      link('Avi Loeb — On the possibility of an artificial origin for ‘Oumuamua', 'https://lweb.cfa.harvard.edu/~loeb/Loeb_Astrobiology.pdf', 'analysis'),
    ],
  },
  {
    id: '3i-atlas',
    zone: 'deep',
    year: 2025,
    when: 'Jul 1, 2025',
    title: '3I/ATLAS',
    where: 'Passing through the Solar System',
    status: 'explained',
    summary:
      'The NASA-funded ATLAS survey telescope at Rio Hurtado in Chile first reported the third known interstellar object on July 1, 2025, when it was about 4.5 times the Earth–Sun distance away. Avi Loeb listed anomalies and rated it 4 on his own scale, which runs from 0 for a natural comet to 10 for dangerous alien technology, although he said that the object is most likely natural.',
    explanation:
      'NASA calls it a comet. Its activity is clear in the observations, and Hubble shows a teardrop-shaped cocoon of dust coming off its icy nucleus.',
    sources: [link('NASA Science — Comet 3I/ATLAS', 'https://science.nasa.gov/solar-system/comets/3i-atlas/')],
  },
];

/** NASA's own UAP work, linked from the section. */
export const NASA_UAP_URL = 'https://science.nasa.gov/uap/';
