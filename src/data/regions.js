/**
 * Region gazetteer for official UAP releases.
 *
 * AARO / PURSUE releases name a region ("Gulf of Oman", "Eastern United
 * States") rather than coordinates. Each entry is an approximate centroid
 * plus an uncertainty radius, so the globe can draw an honest "somewhere in
 * here" ring instead of a precise pin. Entries are matched in order: the most
 * specific places come first, combatant-command areas last.
 */
export const REGIONS = [
  // ── Specific sites named in release titles/descriptions ──
  { match: /karaganda/i, name: 'Karaganda Intl. Airport, Kazakhstan', lat: 49.6708, lon: 73.3344, radiusKm: 15, precision: 'site' },
  { match: /tyndall/i, name: 'Tyndall AFB area, Florida', lat: 30.0696, lon: -85.5754, radiusKm: 60, precision: 'area' },
  { match: /colorado springs/i, name: 'Colorado Springs, Colorado', lat: 38.8339, lon: -104.8214, radiusKm: 25, precision: 'city' },
  { match: /tremonton/i, name: 'Tremonton, Utah', lat: 41.7119, lon: -112.1655, radiusKm: 10, precision: 'city' },
  { match: /aguadilla|puerto rico/i, name: 'Aguadilla, Puerto Rico', lat: 18.4949, lon: -67.1294, radiusKm: 10, precision: 'city' },
  { match: /bagram/i, name: 'Bagram Airfield, Afghanistan', lat: 34.946, lon: 69.265, radiusKm: 10, precision: 'site' },
  { match: /\bgimbal\b|\bgo ?fast\b/i, name: 'Atlantic warning areas off Jacksonville, Florida', lat: 30.3, lon: -80.2, radiusKm: 150, precision: 'area' },
  { match: /^flir\b|\bflir1\b|\bnimitz\b/i, name: 'Pacific off Baja California (USS Nimitz strike group)', lat: 31.3, lon: -117.8, radiusKm: 100, precision: 'area' },
  { match: /eglin/i, name: 'Eglin AFB ranges, Florida', lat: 30.4832, lon: -86.5254, radiusKm: 80, precision: 'area' },
  { match: /lake huron/i, name: 'Lake Huron', lat: 45.35, lon: -82.6, radiusKm: 120, precision: 'area' },
  { match: /columbus,? oh/i, name: 'Columbus, Ohio', lat: 39.9612, lon: -82.9988, radiusKm: 60, precision: 'city' },
  { match: /\bkabul\b/i, name: 'Kabul, Afghanistan', lat: 34.5553, lon: 69.2075, radiusKm: 40, precision: 'city' },
  { match: /\bmosul\b/i, name: 'Mosul, Iraq', lat: 36.34, lon: 43.13, radiusKm: 25, precision: 'city' },
  { match: /\bguam\b/i, name: 'Guam', lat: 13.44, lon: 144.79, radiusKm: 40, precision: 'area' },
  { match: /okinawa/i, name: 'Okinawa, Japan', lat: 26.5, lon: 127.9, radiusKm: 60, precision: 'area' },
  // ── Combatant-command areas named explicitly ("… Central Command area of
  //    responsibility"); must precede the generic "United States" rules. ──
  { match: /central command/i, name: 'Middle East (CENTCOM AOR)', lat: 29.5, lon: 46.0, radiusKm: 1200, precision: 'region' },
  { match: /european command/i, name: 'Europe (EUCOM AOR)', lat: 50.0, lon: 12.0, radiusKm: 1500, precision: 'region' },
  { match: /africa command/i, name: 'Africa (AFRICOM AOR)', lat: 8.0, lon: 20.0, radiusKm: 2500, precision: 'region' },
  { match: /indo-?pacific command/i, name: 'Indo-Pacific (INDOPACOM AOR)', lat: 22.0, lon: 135.0, radiusKm: 2500, precision: 'region' },
  { match: /southern command|southcom/i, name: 'Caribbean & Latin America (SOUTHCOM AOR)', lat: 5.0, lon: -70.0, radiusKm: 2500, precision: 'region' },
  { match: /northern command/i, name: 'United States (NORTHCOM AOR)', lat: 39.8, lon: -98.6, radiusKm: 2000, precision: 'region' },
  // ── Seas, gulfs and straits ──
  { match: /strait of hormuz/i, name: 'Strait of Hormuz', lat: 26.57, lon: 56.25, radiusKm: 80, precision: 'region' },
  { match: /gulf of oman/i, name: 'Gulf of Oman', lat: 24.6, lon: 58.4, radiusKm: 200, precision: 'region' },
  { match: /arabian gulf|persian gulf|gulf of arabia/i, name: 'Persian (Arabian) Gulf', lat: 27.0, lon: 51.4, radiusKm: 300, precision: 'region' },
  { match: /gulf of aden/i, name: 'Gulf of Aden', lat: 12.4, lon: 47.5, radiusKm: 250, precision: 'region' },
  { match: /arabian sea/i, name: 'Arabian Sea', lat: 16.0, lon: 63.0, radiusKm: 600, precision: 'region' },
  { match: /red sea/i, name: 'Red Sea', lat: 20.0, lon: 38.5, radiusKm: 500, precision: 'region' },
  { match: /mediterranean/i, name: 'Mediterranean Sea', lat: 34.5, lon: 20.0, radiusKm: 900, precision: 'region' },
  { match: /black sea/i, name: 'Black Sea', lat: 43.4, lon: 34.3, radiusKm: 400, precision: 'region' },
  { match: /north sea/i, name: 'North Sea', lat: 56.0, lon: 3.0, radiusKm: 400, precision: 'region' },
  { match: /baltic/i, name: 'Baltic Sea', lat: 57.0, lon: 19.5, radiusKm: 350, precision: 'region' },
  { match: /yellow sea/i, name: 'Yellow Sea', lat: 35.5, lon: 123.5, radiusKm: 350, precision: 'region' },
  { match: /[Ee]ast [Cc]hina [Ss]ea|\bECS\b/, name: 'East China Sea', lat: 29.0, lon: 125.0, radiusKm: 450, precision: 'region' },
  { match: /south china sea/i, name: 'South China Sea', lat: 13.5, lon: 114.0, radiusKm: 800, precision: 'region' },
  { match: /sea of japan|east sea/i, name: 'Sea of Japan', lat: 40.0, lon: 135.0, radiusKm: 500, precision: 'region' },
  { match: /philippine sea/i, name: 'Philippine Sea', lat: 20.0, lon: 130.0, radiusKm: 800, precision: 'region' },
  { match: /taiwan strait/i, name: 'Taiwan Strait', lat: 24.5, lon: 119.5, radiusKm: 150, precision: 'region' },
  { match: /gulf of (america|mexico)/i, name: 'Gulf of Mexico (Gulf of America)', lat: 25.5, lon: -90.0, radiusKm: 600, precision: 'region' },
  { match: /east coast/i, name: 'U.S. East Coast', lat: 36.0, lon: -75.5, radiusKm: 600, precision: 'region' },
  { match: /atlantic/i, name: 'Western Atlantic (off U.S. East Coast)', lat: 33.0, lon: -72.0, radiusKm: 700, precision: 'region' },
  { match: /pacific/i, name: 'Pacific Ocean', lat: 25.0, lon: -140.0, radiusKm: 2000, precision: 'region' },
  // ── U.S. regions and states ──
  { match: /north-?eastern united states|northeast(ern)? u\.?s/i, name: 'Northeastern United States', lat: 42.0, lon: -73.5, radiusKm: 450, precision: 'region' },
  { match: /south-?eastern united states/i, name: 'Southeastern United States', lat: 31.5, lon: -84.0, radiusKm: 600, precision: 'region' },
  { match: /eastern united states/i, name: 'Eastern United States', lat: 37.5, lon: -78.0, radiusKm: 700, precision: 'region' },
  { match: /western (united states|usa|u\.s)/i, name: 'Western United States', lat: 38.5, lon: -117.0, radiusKm: 800, precision: 'region' },
  { match: /\bcolorado\b/i, name: 'Colorado', lat: 39.0, lon: -105.5, radiusKm: 250, precision: 'region' },
  { match: /\bcalifornia\b/i, name: 'California', lat: 36.8, lon: -119.4, radiusKm: 450, precision: 'region' },
  { match: /\bnevada\b/i, name: 'Nevada', lat: 38.8, lon: -116.4, radiusKm: 350, precision: 'region' },
  { match: /\butah\b/i, name: 'Utah', lat: 39.3, lon: -111.1, radiusKm: 250, precision: 'region' },
  { match: /\bflorida\b/i, name: 'Florida', lat: 27.8, lon: -81.7, radiusKm: 350, precision: 'region' },
  { match: /\bvirginia\b/i, name: 'Virginia', lat: 37.5, lon: -78.8, radiusKm: 250, precision: 'region' },
  { match: /\bnew jersey\b/i, name: 'New Jersey', lat: 40.1, lon: -74.5, radiusKm: 100, precision: 'region' },
  { match: /\bnew york\b/i, name: 'New York', lat: 42.9, lon: -75.5, radiusKm: 250, precision: 'region' },
  { match: /\bhawaii\b/i, name: 'Hawaii', lat: 20.8, lon: -156.3, radiusKm: 300, precision: 'region' },
  { match: /\balaska\b/i, name: 'Alaska', lat: 64.2, lon: -152.5, radiusKm: 900, precision: 'region' },
  { match: /\btexas\b/i, name: 'Texas', lat: 31.0, lon: -99.9, radiusKm: 500, precision: 'region' },
  { match: /\barizona\b/i, name: 'Arizona', lat: 34.2, lon: -111.7, radiusKm: 300, precision: 'region' },
  { match: /\bnew mexico\b/i, name: 'New Mexico', lat: 34.4, lon: -106.1, radiusKm: 300, precision: 'region' },
  { match: /\bohio\b/i, name: 'Ohio', lat: 40.4, lon: -82.8, radiusKm: 200, precision: 'region' },
  { match: /\bmexico\b/i, name: 'Mexico', lat: 23.6, lon: -102.5, radiusKm: 900, precision: 'region' },
  // ── Countries ──
  { match: /united arab emirates|\buae\b/i, name: 'United Arab Emirates', lat: 23.9, lon: 54.3, radiusKm: 180, precision: 'region' },
  { match: /\bkuwait\b/i, name: 'Kuwait', lat: 29.3, lon: 47.6, radiusKm: 90, precision: 'region' },
  { match: /\biraq\b/i, name: 'Iraq', lat: 33.2, lon: 43.7, radiusKm: 400, precision: 'region' },
  { match: /\bsyria(n)?\b/i, name: 'Syria', lat: 35.0, lon: 38.5, radiusKm: 300, precision: 'region' },
  { match: /\bjordan\b/i, name: 'Jordan', lat: 31.2, lon: 36.5, radiusKm: 200, precision: 'region' },
  { match: /\biran\b/i, name: 'Iran', lat: 32.4, lon: 53.7, radiusKm: 700, precision: 'region' },
  { match: /\bqatar\b/i, name: 'Qatar', lat: 25.3, lon: 51.2, radiusKm: 80, precision: 'region' },
  { match: /\bbahrain\b/i, name: 'Bahrain', lat: 26.0, lon: 50.55, radiusKm: 40, precision: 'region' },
  { match: /saudi/i, name: 'Saudi Arabia', lat: 24.0, lon: 45.0, radiusKm: 800, precision: 'region' },
  { match: /\byemen\b/i, name: 'Yemen', lat: 15.5, lon: 48.0, radiusKm: 400, precision: 'region' },
  { match: /\boman\b/i, name: 'Oman', lat: 21.5, lon: 55.9, radiusKm: 400, precision: 'region' },
  { match: /\bdjibouti\b/i, name: 'Djibouti', lat: 11.6, lon: 43.1, radiusKm: 80, precision: 'region' },
  { match: /\bsomalia\b/i, name: 'Somalia', lat: 5.2, lon: 46.2, radiusKm: 600, precision: 'region' },
  { match: /\bniger\b/i, name: 'Niger', lat: 17.6, lon: 8.1, radiusKm: 700, precision: 'region' },
  { match: /\bafghanistan\b|\bAFG\b/, name: 'Afghanistan', lat: 33.9, lon: 67.7, radiusKm: 450, precision: 'region' },
  { match: /\bgreece\b|aegean/i, name: 'Greece / Aegean', lat: 38.3, lon: 24.0, radiusKm: 300, precision: 'region' },
  { match: /\bturkey\b|t[üu]rkiye/i, name: 'Türkiye', lat: 39.0, lon: 35.0, radiusKm: 600, precision: 'region' },
  { match: /\bpoland\b/i, name: 'Poland', lat: 52.0, lon: 19.1, radiusKm: 350, precision: 'region' },
  { match: /\bromania\b/i, name: 'Romania', lat: 45.9, lon: 24.9, radiusKm: 300, precision: 'region' },
  { match: /\bgermany\b/i, name: 'Germany', lat: 51.2, lon: 10.4, radiusKm: 350, precision: 'region' },
  { match: /\bitaly\b/i, name: 'Italy', lat: 42.8, lon: 12.5, radiusKm: 450, precision: 'region' },
  { match: /\bspain\b/i, name: 'Spain', lat: 40.4, lon: -3.7, radiusKm: 450, precision: 'region' },
  { match: /united kingdom|\bengland\b|\bu\.?k\.?\b/i, name: 'United Kingdom', lat: 54.0, lon: -2.0, radiusKm: 450, precision: 'region' },
  { match: /\bnorway\b/i, name: 'Norway', lat: 64.5, lon: 12.0, radiusKm: 600, precision: 'region' },
  { match: /\bkazakhstan\b/i, name: 'Kazakhstan', lat: 48.0, lon: 67.0, radiusKm: 900, precision: 'region' },
  { match: /\bjapan\b/i, name: 'Japan', lat: 36.2, lon: 138.25, radiusKm: 700, precision: 'region' },
  { match: /\bkorea\b/i, name: 'Korean Peninsula', lat: 36.5, lon: 127.8, radiusKm: 300, precision: 'region' },
  { match: /\bphilippines\b/i, name: 'Philippines', lat: 12.9, lon: 121.8, radiusKm: 700, precision: 'region' },
  { match: /\baustralia\b/i, name: 'Australia', lat: -25.3, lon: 133.8, radiusKm: 1800, precision: 'region' },
  // ── Broad areas and combatant commands (least specific) ──
  { match: /south asia/i, name: 'South Asia (unspecified)', lat: 28.0, lon: 70.0, radiusKm: 1200, precision: 'region' },
  { match: /middle east|centcom/i, name: 'Middle East (CENTCOM AOR)', lat: 29.5, lon: 46.0, radiusKm: 1200, precision: 'region' },
  { match: /africa|africom/i, name: 'Africa (AFRICOM AOR)', lat: 8.0, lon: 20.0, radiusKm: 2500, precision: 'region' },
  { match: /europe|eucom/i, name: 'Europe (EUCOM AOR)', lat: 50.0, lon: 12.0, radiusKm: 1500, precision: 'region' },
  { match: /indo-?pacom|indo-pacific/i, name: 'Indo-Pacific (INDOPACOM AOR)', lat: 22.0, lon: 135.0, radiusKm: 2500, precision: 'region' },
  { match: /northcom|\bunited states\b|\bconus\b/i, name: 'United States (NORTHCOM AOR)', lat: 39.8, lon: -98.6, radiusKm: 2000, precision: 'region' },
];

function lookup(text) {
  if (!text) return null;
  const hit = REGIONS.find((r) => r.match.test(text));
  if (!hit) return null;
  const { match, ...rest } = hit;
  return { ...rest };
}

// Phrases AARO uses to say where a platform was, e.g. "aboard a U.S. Coast
// Guard platform operating in the Southeastern United States in 2024".
const WHERE_PHRASES = [
  /operating (?:in|within|over|above|near|off) (?:the )?([^.,;]+?)(?:\s+(?:in|during) (?:\d{4}|[A-Z][a-z]+ \d{4})|[.,;])/i,
  /(?:captured|recorded|observed|filmed|shot) (?:in|over|near|off) (?:the )?([^.,;]+?)(?:\s+(?:in|on|during) |[.,;])/i,
  /incident in the ([^.,;]+?)(?:[.,;]| as )/i,
];

/**
 * Resolve an official release to a region.
 * The title is checked first; then only explicit "operating in …" style
 * phrases from the description, so boilerplate such as "a U.S. military
 * platform" or "Johnson Space Center, Houston" never becomes a location.
 * @returns {{name:string, lat:number, lon:number, radiusKm:number, precision:string}|null}
 */
export function resolveRegion(title = '', description = '') {
  const fromTitle = lookup(title);
  if (fromTitle) return fromTitle;
  for (const re of WHERE_PHRASES) {
    const m = description.match(re);
    const hit = m && lookup(m[1]);
    if (hit) return hit;
  }
  return null;
}
