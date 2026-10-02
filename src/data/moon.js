import { SPACE } from './space.js';

/**
 * Places on the Moon for the interactive Moon map: the named seas, craters and
 * mountains people look for, and the sites where spacecraft have landed.
 * Positions are selenographic latitude and longitude in degrees (east
 * positive) of the feature's centre. The six Apollo sites match NASA's
 * NSSDC table. A spot check of the rest against Wikipedia's lunar coordinates
 * (themselves from the IAU Gazetteer of Planetary Nomenclature) found 81
 * places within 0.6 degrees and 9 more within about 1.6 degrees; 18 could not
 * be checked that way (ten Surveyor, Luna, Chang'e and IM-1 sites, and eight
 * ranges, valleys and rilles). 1.6 degrees is under 50 km on a body 3,475 km
 * across: close enough to put a name on a map, not a survey.
 *
 *   kind  'sea' (a mare, lake or bay), 'basin', 'crater', 'range' (mountains,
 *         valleys, rilles and other long features), 'site' (a landing or
 *         impact)
 *   tier  how close the camera has to be for the label to show: 1 from afar,
 *         2 on a closer look, 3 only up close
 *   view  how high the camera flies above it when you pick it, in km
 */
export const MOON_KINDS = ['sea', 'basin', 'crater', 'range', 'site'];
export const MOON_RADIUS_KM = 1737.4;
/** The colour of each kind of place, on the map and in the list. */
export const MOON_INK = { sea: '#c9d6e6', basin: '#c9d6e6', crater: '#eef1f5', range: '#b9c6d6', site: '#7dffb2', report: '#00d4ff' };
/** The groups the layer list turns on and off: a basin goes with the seas. */
export const moonGroup = (kind) => (kind === 'basin' ? 'sea' : kind);

const f = (id, name, kind, lat, lon, tier, english, view) => ({ id, name, kind, lat, lon, tier, english, view });

export const MOON_FEATURES = [
  // ── Seas, lakes and bays ──────────────────────────────────
  f('oceanus-procellarum', 'Oceanus Procellarum', 'sea', 18.4, -57.4, 1, 'Ocean of Storms', 3200),
  f('mare-imbrium', 'Mare Imbrium', 'sea', 32.8, -15.6, 1, 'Sea of Showers', 2800),
  f('mare-serenitatis', 'Mare Serenitatis', 'sea', 28.0, 17.5, 1, 'Sea of Serenity', 2200),
  f('mare-tranquillitatis', 'Mare Tranquillitatis', 'sea', 8.5, 31.4, 1, 'Sea of Tranquility', 2400),
  f('mare-crisium', 'Mare Crisium', 'sea', 17.0, 59.1, 1, 'Sea of Crises', 1800),
  f('mare-fecunditatis', 'Mare Fecunditatis', 'sea', -7.8, 51.3, 1, 'Sea of Fertility', 2200),
  f('mare-nectaris', 'Mare Nectaris', 'sea', -15.2, 35.5, 2, 'Sea of Nectar', 1500),
  f('mare-nubium', 'Mare Nubium', 'sea', -21.3, -16.6, 1, 'Sea of Clouds', 2200),
  f('mare-humorum', 'Mare Humorum', 'sea', -24.4, -38.6, 2, 'Sea of Moisture', 1600),
  f('mare-frigoris', 'Mare Frigoris', 'sea', 56.0, 1.4, 1, 'Sea of Cold', 2600),
  f('mare-cognitum', 'Mare Cognitum', 'sea', -10.0, -23.1, 2, 'Sea that has become known', 1500),
  f('mare-insularum', 'Mare Insularum', 'sea', 7.5, -30.9, 2, 'Sea of Islands', 1800),
  f('mare-vaporum', 'Mare Vaporum', 'sea', 13.3, 3.6, 2, 'Sea of Vapors', 1300),
  f('mare-smythii', 'Mare Smythii', 'sea', 1.3, 87.5, 2, 'Smyth’s Sea', 1400),
  f('mare-marginis', 'Mare Marginis', 'sea', 13.3, 86.1, 2, 'Sea of the Edge', 1400),
  f('mare-moscoviense', 'Mare Moscoviense', 'sea', 27.3, 147.9, 2, 'Sea of Moscow', 1500),
  f('mare-ingenii', 'Mare Ingenii', 'sea', -33.7, 163.5, 2, 'Sea of Ingenuity', 1500),
  f('mare-orientale', 'Mare Orientale', 'sea', -19.4, -92.8, 1, 'Eastern Sea', 2000),
  f('sinus-iridum', 'Sinus Iridum', 'sea', 44.1, -31.5, 2, 'Bay of Rainbows', 900),
  f('sinus-medii', 'Sinus Medii', 'sea', 1.6, 0.0, 2, 'Central Bay', 1000),
  f('lacus-somniorum', 'Lacus Somniorum', 'sea', 38.0, 29.2, 3, 'Lake of Dreams', 900),
  f('lacus-mortis', 'Lacus Mortis', 'sea', 45.0, 27.2, 3, 'Lake of Death', 800),
  f('south-pole-aitken', 'South Pole–Aitken basin', 'basin', -53.0, -169.0, 1, 'The Moon’s largest, and among its oldest, impact basins', 4200),

  // ── Craters ──────────────────────────────────────────────
  f('tycho', 'Tycho', 'crater', -43.3, -11.4, 1, 'Bright rays across the south', 700),
  f('copernicus', 'Copernicus', 'crater', 9.6, -20.1, 1, 'Ray crater, 93 km across', 600),
  f('kepler', 'Kepler', 'crater', 8.1, -38.0, 2, null, 500),
  f('aristarchus', 'Aristarchus', 'crater', 23.7, -47.5, 1, 'The brightest large crater', 600),
  f('plato', 'Plato', 'crater', 51.6, -9.4, 2, 'Dark-floored crater in the north', 500),
  f('grimaldi', 'Grimaldi', 'crater', -5.2, -68.3, 2, 'Dark basin on the western limb', 800),
  f('clavius', 'Clavius', 'crater', -58.6, -14.0, 2, 'Among the largest craters of the near side', 800),
  f('tsiolkovskiy', 'Tsiolkovskiy', 'crater', -20.4, 129.1, 2, 'Dark-floored crater on the far side', 700),
  f('hertzsprung', 'Hertzsprung', 'crater', 2.6, -128.7, 3, 'Far-side impact basin', 900),
  f('korolev', 'Korolev', 'crater', -4.0, -157.4, 3, 'Far-side impact basin', 900),
  f('apollo-basin', 'Apollo basin', 'basin', -36.1, -151.8, 3, 'Far side; Chang’e 6 landed here', 900),
  f('von-karman', 'Von Kármán', 'crater', -44.8, 175.9, 3, 'Chang’e 4 landed here', 700),
  f('mendeleev', 'Mendeleev', 'crater', 5.7, 141.1, 3, null, 600),
  f('daedalus', 'Dædalus', 'crater', -5.9, 179.4, 3, 'Near the centre of the far side', 600),
  f('aitken', 'Aitken', 'crater', -16.8, 173.4, 3, null, 500),
  f('ptolemaeus', 'Ptolemaeus', 'crater', -9.3, -1.9, 3, null, 400),
  f('alphonsus', 'Alphonsus', 'crater', -13.4, -2.8, 3, 'Kozyrev’s 1958 observation', 350),
  f('arzachel', 'Arzachel', 'crater', -17.7, -1.9, 3, null, 350),
  f('theophilus', 'Theophilus', 'crater', -11.4, 26.4, 3, null, 400),
  f('cyrillus', 'Cyrillus', 'crater', -13.2, 24.0, 3, null, 400),
  f('catharina', 'Catharina', 'crater', -18.0, 23.4, 3, null, 400),
  f('langrenus', 'Langrenus', 'crater', -8.9, 61.1, 3, null, 450),
  f('petavius', 'Petavius', 'crater', -25.1, 60.4, 3, null, 500),
  f('gassendi', 'Gassendi', 'crater', -17.5, -39.9, 3, null, 450),
  f('schickard', 'Schickard', 'crater', -44.0, -54.6, 3, null, 500),
  f('posidonius', 'Posidonius', 'crater', 31.8, 29.9, 3, null, 400),
  f('eratosthenes', 'Eratosthenes', 'crater', 14.5, -11.3, 3, null, 350),
  f('archimedes', 'Archimedes', 'crater', 29.7, -4.0, 3, null, 400),
  f('aristoteles', 'Aristoteles', 'crater', 50.2, 17.4, 3, null, 400),
  f('eudoxus', 'Eudoxus', 'crater', 44.3, 16.3, 3, null, 350),
  f('manilius', 'Manilius', 'crater', 14.5, 9.1, 3, null, 300),
  f('bullialdus', 'Bullialdus', 'crater', -20.7, -22.2, 3, null, 300),
  f('pitatus', 'Pitatus', 'crater', -29.9, -13.5, 3, null, 350),
  f('maginus', 'Maginus', 'crater', -50.5, -6.3, 3, null, 450),
  f('longomontanus', 'Longomontanus', 'crater', -49.6, -21.8, 3, null, 450),
  f('schiller', 'Schiller', 'crater', -51.9, -39.0, 3, 'An elongated crater', 450),
  f('atlas', 'Atlas', 'crater', 46.7, 44.4, 3, null, 350),
  f('hercules', 'Hercules', 'crater', 46.7, 39.1, 3, null, 350),
  f('hipparchus', 'Hipparchus', 'crater', -5.5, 5.2, 3, null, 400),
  f('albategnius', 'Albategnius', 'crater', -11.2, 4.1, 3, null, 350),
  f('stofler', 'Stöfler', 'crater', -41.1, 6.0, 3, null, 400),
  f('linne', 'Linné', 'crater', 27.7, 11.8, 3, 'A small crater once said to have changed', 250),
  f('messier', 'Messier', 'crater', -1.9, 47.6, 3, 'A pair of elongated craters', 250),
  f('aristillus', 'Aristillus', 'crater', 33.9, 1.2, 3, null, 300),
  f('autolycus', 'Autolycus', 'crater', 30.7, 1.5, 3, null, 300),
  f('moretus', 'Moretus', 'crater', -70.6, -5.5, 3, null, 400),
  f('newton', 'Newton', 'crater', -76.7, -16.9, 3, 'Parts of its floor never see the Sun', 450),
  f('cabeus', 'Cabeus', 'crater', -84.9, -35.5, 3, 'LCROSS impact site, 2009', 400),
  f('malapert', 'Malapert', 'crater', -84.9, 12.9, 3, null, 400),
  f('shoemaker', 'Shoemaker', 'crater', -88.1, 44.9, 3, 'Floor in permanent shadow', 400),
  f('shackleton', 'Shackleton', 'crater', -89.9, 129.8, 3, 'At the south pole', 350),
  f('peary', 'Peary', 'crater', 88.6, 33.0, 3, 'Near the north pole', 400),
  
  // ── Mountains, valleys and long features ─────────────────
  f('montes-apenninus', 'Montes Apenninus', 'range', 18.9, -3.7, 2, 'The Apennine range', 800),
  f('montes-alpes', 'Montes Alpes', 'range', 48.4, -0.7, 3, 'The Alps', 700),
  f('montes-caucasus', 'Montes Caucasus', 'range', 38.4, 10.0, 3, null, 700),
  f('montes-carpatus', 'Montes Carpatus', 'range', 14.4, -24.4, 3, null, 600),
  f('montes-taurus', 'Montes Taurus', 'range', 28.0, 41.0, 3, null, 700),
  f('hadley-rille', 'Rima Hadley', 'range', 25.0, 3.0, 3, 'Apollo 15 landed beside it', 150),
  f('taurus-littrow', 'Taurus–Littrow valley', 'range', 20.0, 30.8, 3, 'Apollo 17 landed here', 200),
  f('rupes-recta', 'Rupes Recta', 'range', -21.8, -7.8, 3, 'The Straight Wall, a fault 110 km long', 250),
  f('vallis-schroteri', 'Vallis Schröteri', 'range', 26.2, -50.8, 3, 'A sinuous valley beside Aristarchus', 250),
  f('rima-hyginus', 'Rima Hyginus', 'range', 7.8, 6.3, 3, null, 250),
  f('rima-ariadaeus', 'Rima Ariadaeus', 'range', 6.4, 13.0, 3, null, 250),
  f('mons-rumker', 'Mons Rümker', 'range', 40.8, -58.1, 3, 'A volcanic plateau', 250),
  f('fra-mauro', 'Fra Mauro', 'range', -6.0, -17.0, 3, 'Apollo 14 landed here', 350),
  f('reiner-gamma', 'Reiner Gamma', 'range', 7.5, -59.0, 3, 'A bright swirl on the plain', 300),
];

/** Where spacecraft have landed or struck the Moon. */
// `dy` nudges a name up (negative) or down (positive) on screen where two sites are a few kilometres apart.
const s = (id, name, lat, lon, when, note, year, dy = 0) => ({ id, name, kind: 'site', lat, lon, tier: 2, view: 120, when, note, year, dy });

export const MOON_SITES = [
  s('luna-2', 'Luna 2', 29.1, 0.0, '13 Sep 1959', 'Soviet probe; the first human-made object to reach the Moon, by impact', 1959),
  s('luna-9', 'Luna 9', 7.08, -64.37, '3 Feb 1966', 'Soviet; the first soft landing and the first pictures from the surface', 1966),
  s('surveyor-1', 'Surveyor 1', -2.47, -43.34, '2 Jun 1966', 'NASA; the first American soft landing', 1966),
  s('surveyor-3', 'Surveyor 3', -2.94, -23.42, '20 Apr 1967', 'NASA; Apollo 12 landed near it in 1969', 1967, 14),
  s('surveyor-5', 'Surveyor 5', 1.41, 23.18, '11 Sep 1967', 'NASA; analysed the soil with an alpha-scattering instrument', 1967, -14),
  s('surveyor-6', 'Surveyor 6', 0.5, -1.4, '10 Nov 1967', 'NASA; the first lift-off from the Moon, a short hop', 1967),
  s('surveyor-7', 'Surveyor 7', -40.9, -11.5, '10 Jan 1968', 'NASA; the last Surveyor, on the rim of Tycho’s ejecta', 1968),
  s('apollo-11', 'Apollo 11', 0.67, 23.47, '20 Jul 1969', 'Tranquility Base: the first crewed landing (Armstrong and Aldrin)', 1969),
  s('apollo-12', 'Apollo 12', -3.01, -23.42, '19 Nov 1969', 'Ocean of Storms, beside Surveyor 3 (Conrad and Bean)', 1969),
  s('apollo-14', 'Apollo 14', -3.65, -17.47, '5 Feb 1971', 'Fra Mauro highlands (Shepard and Mitchell)', 1971),
  s('apollo-15', 'Apollo 15', 26.13, 3.63, '30 Jul 1971', 'Hadley–Apennine, with the first lunar rover (Scott and Irwin)', 1971),
  s('apollo-16', 'Apollo 16', -8.97, 15.5, '21 Apr 1972', 'Descartes highlands (Young and Duke)', 1972),
  s('apollo-17', 'Apollo 17', 20.19, 30.77, '11 Dec 1972', 'Taurus–Littrow valley, the last crewed landing (Cernan and Schmitt)', 1972),
  s('luna-16', 'Luna 16', -0.68, 56.3, '20 Sep 1970', 'Soviet; the first robotic sample return from the Moon', 1970),
  s('luna-17', 'Luna 17 and Lunokhod 1', 38.28, -35.0, '17 Nov 1970', 'Soviet; the first robotic rover on another world', 1970),
  s('luna-20', 'Luna 20', 3.57, 56.55, '21 Feb 1972', 'Soviet; a second robotic sample return', 1972),
  s('luna-21', 'Luna 21 and Lunokhod 2', 25.85, 30.45, '15 Jan 1973', 'Soviet; the second rover, which travelled about 39 km', 1973),
  s('luna-24', 'Luna 24', 12.75, 62.2, '18 Aug 1976', 'Soviet; the last Soviet lunar mission, and a sample return', 1976),
  s('change-3', 'Chang’e 3 and Yutu', 44.12, -19.51, '14 Dec 2013', 'China; the first soft landing since 1976, with a rover', 2013),
  s('change-4', 'Chang’e 4 and Yutu-2', -45.46, 177.59, '3 Jan 2019', 'China; the first landing on the far side', 2019),
  s('change-5', 'Chang’e 5', 43.06, -51.92, '1 Dec 2020', 'China; a sample return from Oceanus Procellarum', 2020),
  s('change-6', 'Chang’e 6', -41.64, -153.99, '1 Jun 2024', 'China; the first samples brought back from the far side', 2024),
  s('chandrayaan-3', 'Chandrayaan-3', -69.37, 32.32, '23 Aug 2023', 'India; the first soft landing near the south pole', 2023),
  s('slim', 'SLIM', -13.3, 25.25, '19 Jan 2024', 'Japan; a precision landing, on the slope of a small crater', 2024),
  s('im-1', 'IM-1 Odysseus', -80.13, 1.44, '22 Feb 2024', 'Intuitive Machines (U.S.); the first commercial landing, near Malapert A', 2024),
];

/**
 * When each one landed (UTC), for lighting the map by the Sun at that moment.
 * The Apollo times are from the mission reports; `≈` marks the Luna landings,
 * whose time of day is less certain than their date.
 */
const LANDED = {
  'luna-2': '1959-09-13T21:02:24Z',
  'luna-9': '1966-02-03T18:45:30Z',
  'surveyor-1': '1966-06-02T06:17:36Z',
  'surveyor-3': '1967-04-20T00:04:17Z',
  'surveyor-5': '1967-09-11T00:46:44Z',
  'surveyor-6': '1967-11-10T01:01:06Z',
  'surveyor-7': '1968-01-10T01:05:36Z',
  'apollo-11': '1969-07-20T20:17:40Z',
  'apollo-12': '1969-11-19T06:54:35Z',
  'apollo-14': '1971-02-05T09:18:11Z',
  'apollo-15': '1971-07-30T22:16:29Z',
  'apollo-16': '1972-04-21T02:23:35Z',
  'apollo-17': '1972-12-11T19:54:57Z',
  'luna-16': '1970-09-20T05:18:00Z≈',
  'luna-17': '1970-11-17T03:47:00Z≈',
  'luna-20': '1972-02-21T19:19:00Z≈',
  'luna-21': '1973-01-15T22:35:00Z≈',
  'luna-24': '1976-08-18T06:36:00Z≈',
  'change-3': '2013-12-14T13:11:00Z',
  'change-4': '2019-01-03T02:26:00Z',
  'change-5': '2020-12-01T15:11:00Z',
  'change-6': '2024-06-01T22:23:00Z',
  'chandrayaan-3': '2023-08-23T12:33:00Z',
  slim: '2024-01-19T15:20:00Z',
  'im-1': '2024-02-22T23:23:00Z',
};
for (const site of MOON_SITES) {
  const at = LANDED[site.id];
  if (at) site.moment = { at: at.replace('≈', ''), approx: at.endsWith('≈') };
}

export const MOON_PLACES = [...MOON_FEATURES, ...MOON_SITES];

/**
 * The lunar reports in Space & Moon with a place on the map, in the order the
 * numbered pins use: by year, each with the next number. A report's places are
 * its near-side ones and any past the limb.
 */
export function moonReports() {
  return SPACE.filter((e) => e.zone === 'moon')
    .map((entry) => ({ entry, sites: [...(entry.moon || []), ...(entry.moonFar || [])] }))
    .filter((r) => r.sites.length)
    .sort((a, b) => a.entry.year - b.entry.year)
    .map((r, i) => ({ n: i + 1, ...r }));
}

const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Places and reports whose name, English name, date or note contain every word typed. */
export function searchMoon(query, places = MOON_PLACES, reports = moonReports()) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hit = (text) => words.every((w) => fold(text).includes(w));
  return {
    reports: reports.filter((r) => hit(`${r.entry.title} ${r.entry.when} ${r.entry.where}`)),
    places: places.filter((p) => hit(`${p.name} ${p.english || ''} ${p.when || ''} ${p.note || ''}`)),
  };
}

/** The camera height in metres for flying to a place. */
export const viewHeight = (place) => (place.view || 500) * 1000;
