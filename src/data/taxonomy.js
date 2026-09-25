/** Shared vocabularies for evidence, status and categories. */

export const EVIDENCE = {
  video: { label: 'VIDEO', long: 'Video / film footage' },
  film: { label: 'FILM', long: 'Motion-picture film' },
  photo: { label: 'PHOTO', long: 'Photographs' },
  radar: { label: 'RADAR', long: 'Radar tracking' },
  'sensor-data': { label: 'IR/SENSOR', long: 'Infrared or other sensor data' },
  'official-document': { label: 'GOV DOC', long: 'Official government document or case file' },
  'military-witness': { label: 'MILITARY', long: 'Military witnesses' },
  'pilot-witness': { label: 'PILOTS', long: 'Pilot / aircrew witnesses' },
  'police-witness': { label: 'POLICE', long: 'Police witnesses' },
  'multiple-witnesses': { label: 'MULTI-WITNESS', long: 'Many independent witnesses' },
  'physical-trace': { label: 'TRACE', long: 'Physical traces (ground marks, debris, soil)' },
  medical: { label: 'MEDICAL', long: 'Documented physiological effects' },
  audio: { label: 'AUDIO', long: 'Audio recording / radio transcript' },
  'em-effects': { label: 'EM EFFECTS', long: 'Reported electromagnetic effects (engines, instruments)' },
};

export const STATUS = {
  unresolved: { label: 'UNRESOLVED', long: 'No accepted explanation', color: '#00d4ff' },
  disputed: { label: 'DISPUTED', long: 'Explanation proposed but contested', color: '#ffb547' },
  explained: { label: 'EXPLAINED', long: 'Mundane explanation widely accepted or officially assessed', color: '#9aa4b2' },
  identified: { label: 'IDENTIFIED', long: 'Object positively identified', color: '#9aa4b2' },
  unassessed: { label: 'UNASSESSED', long: 'Released without an official determination', color: '#c792ea' },
};

export const CATEGORY = {
  'military-encounter': 'Military encounter',
  aviation: 'Aviation encounter',
  'radar-visual': 'Radar-visual case',
  'mass-sighting': 'Mass sighting',
  'photo-video': 'Photo / video case',
  'landing-trace': 'Landing / trace case',
  'close-encounter': 'Close encounter',
  'recurring-lights': 'Recurring lights',
  'object-event': 'Tracked object event',
  historical: 'Historical account',
};

export const TRACK_KINDS = {
  uap: { label: 'UAP', color: '#7dffb2' },
  aircraft: { label: 'Aircraft', color: '#00d4ff' },
  ship: { label: 'Ship', color: '#5aa9ff' },
  vehicle: { label: 'Vehicle', color: '#ffd166' },
  balloon: { label: 'Balloon', color: '#ffb547' },
  meteor: { label: 'Meteor / re-entry', color: '#ff8a5c' },
  rocket: { label: 'Rocket', color: '#ff8a5c' },
};

export const TRACK_BASIS = {
  radar: 'Radar data',
  'official-report': 'Official report',
  'witness-reports': 'Witness reports',
  reconstruction: 'Analyst reconstruction',
  'flight-plan': 'Known route / flight plan',
  approximate: 'Approximate illustration',
};

export const PRECISION = {
  site: 'Exact site (±1 km)',
  city: 'Town / city level',
  area: 'Area (tens of km)',
  region: 'Region only — exact position not released',
};

/**
 * A rough "how much evidence is there" score, 0–10: instrument data counts
 * most, then imagery, official papers and trained observers, then crowds and
 * after-effects. It measures documentation, not strangeness: a solved case
 * can score high.
 */
const EVIDENCE_WEIGHT = {
  radar: 3,
  'sensor-data': 3,
  video: 3,
  film: 3,
  photo: 2,
  'official-document': 2,
  'military-witness': 2,
  'pilot-witness': 2,
  'police-witness': 2,
  'physical-trace': 2,
  'multiple-witnesses': 1,
  medical: 1,
  audio: 1,
  'em-effects': 1,
};
export function evidenceScore(evidence = [], hasTrack = false) {
  const raw = evidence.reduce((s, e) => s + (EVIDENCE_WEIGHT[e] || 0), 0) + (hasTrack ? 1 : 0);
  return Math.min(10, Math.round(raw * 0.7));
}

/** Broad shape classes for filtering; a description can fall in several. */
export const SHAPES = {
  disc: { label: 'Disc / saucer', re: /\bdiscs?\b|\bdisks?\b|saucer|pancake|heel|\bhat\b|\bdomed?\b|\bplates?\b/i },
  cylinder: { label: 'Tic Tac / cigar', re: /tic ?tac|cigar|cylind|capsule|\btubes?\b|airship|spindle|fuel tank|railroad car|\bpill\b/i },
  triangle: { label: 'Triangle / V', re: /triang|delta|\bv\b|v-shaped|v-formation|boomerang|chevron|pyramid|carpenter|diamond/i },
  sphere: { label: 'Sphere / orb', re: /spher|\borbs?\b|\bballs?\b|globe|\bround\b|circular|\bcircles?\b|\begg|\boval\b/i },
  lights: { label: 'Lights / fireball', re: /\blights?\b|fireball|\bglow|flash|\bbeams?\b|star-like|luminous|\bflares?\b/i },
  formation: { label: 'Formation / row', re: /formation|\brow\b|\bline\b|\bchain\b|echelon|several|\btrain\b|group of/i },
};

export function shapeClasses(text = '') {
  return Object.keys(SHAPES).filter((k) => SHAPES[k].re.test(text || ''));
}
