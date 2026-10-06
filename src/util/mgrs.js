/**
 * The Military Grid Reference System: the grid soldiers, pilots and search
 * parties read positions in ("13S DE 12345 67890"), and the one a report from
 * a military witness often uses. Latitude and longitude go through the UTM
 * projection (WGS 84, the Krüger series to the fourth order, good to a
 * millimetre inside a zone) and out as a zone, a band, a 100 km square and
 * the metres within it. UTM covers 80°S to 84°N; the polar caps (UPS) are not
 * handled and give ''/null.
 */
const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const N = F / (2 - F);
const N2 = N * N;
const N3 = N2 * N;
const N4 = N3 * N;
const RADIUS = (A / (1 + N)) * (1 + N2 / 4 + N4 / 64);
const ALPHA = [N / 2 - (2 * N2) / 3 + (5 * N3) / 16 + (41 * N4) / 180, (13 * N2) / 48 - (3 * N3) / 5 + (557 * N4) / 1440, (61 * N3) / 240 - (103 * N4) / 140, (49561 * N4) / 161280];
const BETA = [N / 2 - (2 * N2) / 3 + (37 * N3) / 96 - N4 / 360, N2 / 48 + N3 / 15 - (437 * N4) / 1440, (17 * N3) / 480 - (37 * N4) / 840, (4397 * N4) / 161280];
const DELTA = [2 * N - (2 * N2) / 3 - 2 * N3 + (116 * N4) / 45, (7 * N2) / 3 - (8 * N3) / 5 - (227 * N4) / 45, (56 * N3) / 15 - (136 * N4) / 35, (4279 * N4) / 630];

const BANDS = 'CDEFGHJKLMNPQRSTUVWX';
const COLUMNS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
const ROWS = 'ABCDEFGHJKLMNPQRSTUV';
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** The UTM zone of a place, with the exceptions around Norway and Svalbard. */
export function utmZone(lat, lon) {
  let zone = Math.floor((lon + 180) / 6) + 1;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  else if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zone = 31;
    else if (lon >= 9 && lon < 21) zone = 33;
    else if (lon >= 21 && lon < 33) zone = 35;
    else if (lon >= 33 && lon < 42) zone = 37;
  }
  return Math.min(60, Math.max(1, zone));
}

/** { zone, band, hemisphere, easting, northing } for a latitude and longitude, or null outside 80°S–84°N. `zone` projects into that zone instead of the one the place is in. */
export function toUtm(lat, lon, zone = utmZone(lat, lon)) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -80 || lat > 84) return null;
  const lon0 = rad((zone - 1) * 6 - 180 + 3);
  const phi = rad(lat);
  const dl = rad(lon) - lon0;
  const e = Math.sqrt(F * (2 - F));
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi0 = Math.atan2(t, Math.cos(dl));
  const eta0 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let xi = xi0;
  let eta = eta0;
  ALPHA.forEach((a, i) => {
    const j = 2 * (i + 1);
    xi += a * Math.sin(j * xi0) * Math.cosh(j * eta0);
    eta += a * Math.cos(j * xi0) * Math.sinh(j * eta0);
  });
  const northern = lat >= 0;
  return {
    zone,
    band: BANDS[Math.min(19, Math.floor((lat + 80) / 8))],
    hemisphere: northern ? 'N' : 'S',
    easting: 500000 + K0 * RADIUS * eta,
    northing: (northern ? 0 : 10000000) + K0 * RADIUS * xi,
  };
}

/** { lat, lon } for a UTM position. */
export function fromUtm({ zone, hemisphere, easting, northing }) {
  const eta = (easting - 500000) / (K0 * RADIUS);
  const xi = (northing - (hemisphere === 'S' ? 10000000 : 0)) / (K0 * RADIUS);
  let xi0 = xi;
  let eta0 = eta;
  BETA.forEach((b, i) => {
    const j = 2 * (i + 1);
    xi0 -= b * Math.sin(j * xi) * Math.cosh(j * eta);
    eta0 -= b * Math.cos(j * xi) * Math.sinh(j * eta);
  });
  const chi = Math.asin(Math.sin(xi0) / Math.cosh(eta0));
  let phi = chi;
  DELTA.forEach((d, i) => (phi += d * Math.sin(2 * (i + 1) * chi)));
  const lon0 = (zone - 1) * 6 - 180 + 3;
  return { lat: deg(phi), lon: lon0 + deg(Math.atan2(Math.sinh(eta0), Math.cos(xi0))) };
}

/** "13S DE 12345 67890": digits is how many per half (5 = metres, 4 = 10 m … 1 = 10 km). '' outside UTM. */
export function toMgrs(lat, lon, digits = 5) {
  const u = toUtm(lat, lon);
  if (!u) return '';
  const column = COLUMNS[(u.zone - 1) % 3][Math.floor(u.easting / 100000) - 1];
  const row = ROWS[(Math.floor(u.northing / 100000) + (u.zone % 2 === 0 ? 5 : 0)) % 20];
  const part = (v) => String(Math.floor((v % 100000) / 10 ** (5 - digits))).padStart(digits, '0').slice(0, digits);
  return `${u.zone}${u.band} ${column}${row}${digits ? ` ${part(u.easting)} ${part(u.northing)}` : ''}`;
}

/**
 * The lowest northing in a latitude band within a zone, to place a grid row in the right 2,000 km cycle.
 * A parallel's northing changes across the zone, so the middle and both edges are tried, all projected
 * into this zone (a longitude on the middle of 31 is in 32 where Norway's exception starts).
 */
function bandSouthNorthing(band, zone) {
  const lat = Math.min(-80 + BANDS.indexOf(band) * 8 + 0.0001, 83.9999);
  const middle = (zone - 1) * 6 - 180 + 3;
  return Math.min(...[-3, 0, 3].map((d) => toUtm(lat, middle + d, zone).northing));
}

const PATTERN = /^\s*(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])\s*([A-HJ-NP-V])\s*(\d*)\s*(\d*)\s*$/i;

/** { lat, lon } (the middle of the grid cell) for MGRS text, with or without spaces, or null. */
export function fromMgrs(text) {
  const m = PATTERN.exec(String(text ?? '').toUpperCase());
  if (!m) return null;
  let [, z, band, col, row, d1, d2] = m;
  const zone = Number(z);
  if (zone < 1 || zone > 60) return null;
  if (band === 'X' && zone % 2 === 0 && zone >= 32 && zone <= 36) return null; // Svalbard's wider zones took the place of 32X, 34X and 36X
  let east = d1;
  let north = d2;
  if (!d2 && d1) {
    if (d1.length % 2) return null;
    east = d1.slice(0, d1.length / 2);
    north = d1.slice(d1.length / 2);
  }
  if (east.length !== north.length || east.length > 5) return null;
  const digits = east.length;
  const columnIndex = COLUMNS[(zone - 1) % 3].indexOf(col);
  if (columnIndex < 0) return null;
  const rowIndex = (ROWS.indexOf(row) - (zone % 2 === 0 ? 5 : 0) + 20) % 20;
  const cell = digits ? 10 ** (5 - digits) : 100000;
  const e100 = (columnIndex + 1) * 100000;
  const eOffset = digits ? Number(east) * cell : 0;
  const nOffset = digits ? Number(north) * cell : 0;
  let northing = rowIndex * 100000 + nOffset;
  const floor = bandSouthNorthing(band, zone);
  // A coarse square can start below the band's southern edge and still lie in the band: it is the top of the square that has to reach it.
  while (northing + cell < floor - 1000) northing += 2000000;
  const hemisphere = band < 'N' ? 'S' : 'N';
  const position = fromUtm({ zone, hemisphere, easting: e100 + eOffset + cell / 2, northing: northing + cell / 2 });
  return Number.isFinite(position.lat) && position.lat >= -80.5 && position.lat <= 84.5 ? position : null;
}
