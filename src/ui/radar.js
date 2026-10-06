/**
 * A radar-style plan view of what was reported around a place: you at the
 * centre, north at the top, rings for the distance, and a blip for each record
 * at its bearing and distance. The blips are links to the records. Drawn as
 * SVG, with a sweep that stands still for visitors who ask for less motion.
 */
import { raw, esc } from '../util/dom.js';
import { t } from '../i18n/index.js';

export const RADAR_RANGE_KM = 250;
export const RADAR_RINGS_KM = [50, 100, 250];
const R = 100; // radius of the scope in drawing units

/** The drawing position of a blip: distance and bearing (clockwise from north) to x, y with north up. */
export function blipPosition(distKm, bearing, rangeKm = RADAR_RANGE_KM, radius = R) {
  const r = Math.max(0, Math.min(1, distKm / rangeKm)) * radius;
  const a = (bearing * Math.PI) / 180;
  const round = (v) => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0
  return { x: round(r * Math.sin(a)), y: round(-r * Math.cos(a)) };
}

/** Which of the records can be drawn: a distance within range and a bearing. */
export const plottable = (p, rangeKm = RADAR_RANGE_KM) => Number.isFinite(p.distKm) && Number.isFinite(p.bearing) && p.distKm <= rangeKm;

/**
 * @param {Array<{href:string, label:string, distKm:number, bearing:number, color:string}>} points
 * @returns the SVG as text, or '' when there is nothing to draw
 */
export function radarSvg(points, { rangeKm = RADAR_RANGE_KM } = {}) {
  const shown = points.filter((p) => plottable(p, rangeKm));
  if (!shown.length) return '';
  const rings = RADAR_RINGS_KM.filter((km) => km <= rangeKm).map((km) => ({ km, r: (km / rangeKm) * R }));
  const label = esc(t('Radar view: {n} records within {range} km, north at the top', { n: shown.length, range: rangeKm }));
  const cardinal = [['N', 0, -R - 7], ['E', R + 8, 3], ['S', 0, R + 13], ['W', -R - 8, 3]];
  const wedge = `M0 0 L0 ${-R} A${R} ${R} 0 0 1 ${(R * Math.sin(Math.PI / 6)).toFixed(2)} ${(-R * Math.cos(Math.PI / 6)).toFixed(2)} Z`;
  return `<svg class="radar" viewBox="-118 -118 236 236" role="group" aria-label="${label}">
    <defs><radialGradient id="radar-sweep-fill" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00d4ff" stop-opacity="0" /><stop offset="1" stop-color="#00d4ff" stop-opacity="0.34" /></radialGradient></defs>
    <circle class="radar-disc" r="${R}" />
    ${rings.map(({ r }) => `<circle class="radar-ring" r="${r}" />`).join('')}
    <path class="radar-axis" d="M0 ${-R}V${R}M${-R} 0H${R}" />
    <g class="radar-sweep" aria-hidden="true"><path d="${wedge}" fill="url(#radar-sweep-fill)" /><path class="radar-beam" d="M0 0V${-R}" /></g>
    ${rings.map(({ km, r }) => `<text class="radar-scale" x="${(r * 0.7071 + 2).toFixed(1)}" y="${(-r * 0.7071 - 1).toFixed(1)}">${km}</text>`).join('')}
    ${cardinal.map(([c, x, y]) => `<text class="radar-cardinal" x="${x}" y="${y}" text-anchor="middle" aria-hidden="true">${c}</text>`).join('')}
    ${shown.map((p) => {
      const { x, y } = blipPosition(p.distKm, p.bearing, rangeKm);
      return `<a href="${esc(p.href)}" aria-label="${esc(p.label)}"><title>${esc(p.label)}</title><circle class="radar-hit" cx="${x}" cy="${y}" r="7" /><circle class="radar-blip" cx="${x}" cy="${y}" r="3.2" fill="${esc(p.color)}" /></a>`;
    }).join('')}
    <circle class="radar-you" r="3" />
  </svg>`;
}

/** The scope as markup for html`` templates. */
export const radarScope = (points, opts) => raw(radarSvg(points, opts));
