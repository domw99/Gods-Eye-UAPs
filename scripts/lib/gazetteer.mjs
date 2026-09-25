/**
 * Name tables used to read Project Blue Book file names ("Miami-Florida",
 * "LosAngeles-Calif", "HollomanAFB-N-M", "Tehran-Iran", "40N173W").
 * Keys are normalised: lower-case ASCII letters and digits only.
 */

// U.S. state abbreviations and period spellings → full state name.
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const VARIANTS = {
  AL: ['ala', 'alab'], AZ: ['ariz'], AR: ['ark'], CA: ['calif', 'cal', 'cali'],
  CO: ['colo', 'col'], CT: ['conn'], DE: ['del'], DC: ['washingtondc', 'districtofcolumbia', 'dc', 'wdc'],
  FL: ['fla', 'flor'], GA: ['ga'], ID: ['ida'], IL: ['ill', 'ills'], IN: ['ind'],
  KS: ['kans', 'kan'], KY: ['ken', 'kent'], LA: ['la'], MD: ['md'], MA: ['mass'],
  MI: ['mich'], MN: ['minn'], MS: ['miss'], MO: ['mo'], MT: ['mont'],
  NE: ['nebr', 'neb'], NV: ['nev'], NH: ['nh'], NJ: ['nj'], NM: ['nm', 'nmex', 'newmex'],
  NY: ['ny', 'nyork'], NC: ['nc', 'ncar'], ND: ['nd', 'ndak'], OK: ['okla'],
  OR: ['ore', 'oreg'], PA: ['pa', 'penn', 'penna'], RI: ['ri'], SC: ['sc', 'scar'],
  SD: ['sd', 'sdak'], TN: ['tenn'], TX: ['tex', 'westtexas', 'easttexas', 'northtexas', 'southtexas', 'westtex'],
  UT: ['ut'], VT: ['vt'], VA: ['va'], WA: ['wash', 'washingtonstate'], WV: ['wva', 'wvirginia'],
  WI: ['wis', 'wisc'], WY: ['wyo'],
};

export const US_STATES = {};
for (const [code, name] of Object.entries(STATE_NAMES)) {
  const entry = { code, name };
  US_STATES[name.toLowerCase().replace(/[^a-z]/g, '')] = entry;
  for (const v of VARIANTS[code] || []) US_STATES[v] = entry;
  // Two-letter codes are only ever read from the final (region) token.
  US_STATES[code.toLowerCase()] = entry;
}
// Blue Book writes the capital as "Washington-DC"; plain "Washington" is the state.
US_STATES.washingtondc = { code: 'DC', name: 'Washington, D.C.' };

/**
 * Regions that are not a GeoNames country or first-level division by name.
 * `key` is a GeoNames country code ("KR") or "CC.admin1" key; entries with
 * lat/lon are fixed areas (oceans, historical regions).
 */
export const REGION_ALIASES = {
  england: { key: 'GB.ENG', label: 'England', cc: 'GB' },
  scotland: { key: 'GB.SCT', label: 'Scotland', cc: 'GB' },
  wales: { key: 'GB.WLS', label: 'Wales', cc: 'GB' },
  northernireland: { key: 'GB.NIR', label: 'Northern Ireland', cc: 'GB' },
  uk: { key: 'GB', label: 'United Kingdom', cc: 'GB' },
  greatbritain: { key: 'GB', label: 'United Kingdom', cc: 'GB' },
  korea: { key: 'KR', label: 'Korea', cc: 'KR' },
  southkorea: { key: 'KR', label: 'South Korea', cc: 'KR' },
  northkorea: { key: 'KP', label: 'North Korea', cc: 'KP' },
  labrador: { key: 'CA.05', label: 'Labrador, Canada', cc: 'CA' },
  newfoundland: { key: 'CA.05', label: 'Newfoundland, Canada', cc: 'CA' },
  ontario: { key: 'CA.08', label: 'Ontario, Canada', cc: 'CA' },
  quebec: { key: 'CA.10', label: 'Quebec, Canada', cc: 'CA' },
  britishcolumbia: { key: 'CA.02', label: 'British Columbia, Canada', cc: 'CA' },
  alberta: { key: 'CA.01', label: 'Alberta, Canada', cc: 'CA' },
  manitoba: { key: 'CA.03', label: 'Manitoba, Canada', cc: 'CA' },
  saskatchewan: { key: 'CA.11', label: 'Saskatchewan, Canada', cc: 'CA' },
  novascotia: { key: 'CA.07', label: 'Nova Scotia, Canada', cc: 'CA' },
  newbrunswick: { key: 'CA.04', label: 'New Brunswick, Canada', cc: 'CA' },
  okinawa: { key: 'JP.47', label: 'Okinawa, Japan', cc: 'JP' },
  formosa: { key: 'TW', label: 'Taiwan', cc: 'TW' },
  persia: { key: 'IR', label: 'Iran', cc: 'IR' },
  holland: { key: 'NL', label: 'Netherlands', cc: 'NL' },
  westgermany: { key: 'DE', label: 'West Germany', cc: 'DE' },
  eastgermany: { key: 'DE', label: 'East Germany', cc: 'DE' },
  russia: { key: 'RU', label: 'Russia (USSR)', cc: 'RU' },
  ussr: { key: 'RU', label: 'USSR', cc: 'RU' },
  sovietunion: { key: 'RU', label: 'USSR', cc: 'RU' },
  puertorico: { key: 'PR', label: 'Puerto Rico', cc: 'PR' },
  canalzone: { key: 'PA', label: 'Panama Canal Zone', cc: 'PA' },
  phillipines: { key: 'PH', label: 'Philippines', cc: 'PH' },
  philippines: { key: 'PH', label: 'Philippines', cc: 'PH' },
  azores: { key: 'PT.23', label: 'Azores, Portugal', cc: 'PT' },
  bermuda: { key: 'BM', label: 'Bermuda', cc: 'BM' },
  guam: { key: 'GU', label: 'Guam', cc: 'GU' },
  iwojima: { key: 'JP', label: 'Iwo Jima', cc: 'JP', lat: 24.7833, lon: 141.3167 },
  pacific: { key: 'XO', label: 'Pacific Ocean', lat: 25, lon: -150 },
  pacificocean: { key: 'XO', label: 'Pacific Ocean', lat: 25, lon: -150 },
  atlantic: { key: 'XA', label: 'Atlantic Ocean', lat: 35, lon: -45 },
  atlanticocean: { key: 'XA', label: 'Atlantic Ocean', lat: 35, lon: -45 },
  neatlantic: { key: 'XA', label: 'North-east Atlantic', lat: 45, lon: -25 },
  gulfofmexico: { key: 'XG', label: 'Gulf of Mexico', lat: 25.5, lon: -90 },
  caribbean: { key: 'XC', label: 'Caribbean Sea', lat: 15, lon: -75 },
  mediterranean: { key: 'XM', label: 'Mediterranean Sea', lat: 35, lon: 18 },
  arctic: { key: 'XR', label: 'Arctic', lat: 78, lon: -40 },
  greenland: { key: 'GL', label: 'Greenland', cc: 'GL' },
  alaska: { key: 'US.AK', label: 'Alaska', cc: 'US' },
  hawaii: { key: 'US.HI', label: 'Hawaii', cc: 'US' },
  antarctica: { key: 'AQ', label: 'Antarctica', lat: -78, lon: 166 },
};
