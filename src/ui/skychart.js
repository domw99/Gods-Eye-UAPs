import { html, raw } from '../util/dom.js';
import { compass } from '../services/sky.js';

/**
 * A small all-sky chart for the dossier: looking straight up, north at the
 * top and east on the left (as on a planisphere). The horizon is the outer
 * ring and the zenith is the centre.
 */
const SIZE = 240;
const C = SIZE / 2;
const R = SIZE / 2 - 22;
const KIND_COLOR = { moon: '#e8eef5', planet: '#ffd166', star: '#9fd8ff', sun: '#ffb547' };

function project(alt, az) {
  const r = ((90 - Math.max(0, alt)) / 90) * R;
  const a = (az * Math.PI) / 180;
  // North up, east left: x = -sin(az), y = -cos(az).
  return [C - r * Math.sin(a), C - r * Math.cos(a)];
}

const dotSize = (b) => (b.kind === 'moon' || b.kind === 'sun' ? 7 : Math.max(1.6, 4.2 - b.mag * 0.9));

export function skyChartSvg(sky, named = new Set()) {
  const marks = [];
  if (sky.sun.alt > -0.833) {
    const [x, y] = project(sky.sun.alt, sky.sun.az);
    marks.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${KIND_COLOR.sun}" />`);
    marks.push(`<text x="${(x + 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" class="sky-label">Sun</text>`);
  }
  const labelled = sky.bodies.filter((b) => b.alt > 0 && (b.kind !== 'star' || b.mag < 0.6 || named.has(b.name)));
  for (const b of sky.bodies.filter((b) => b.alt > 0)) {
    const [x, y] = project(b.alt, b.az);
    const isNamed = named.has(b.name);
    if (isNamed) marks.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(dotSize(b) + 5).toFixed(1)}" fill="none" stroke="#ff5ce1" stroke-width="1.5" />`);
    marks.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotSize(b).toFixed(1)}" fill="${KIND_COLOR[b.kind]}" />`);
    if (labelled.includes(b)) {
      // Keep labels inside the disc: put them on the left of objects low in the west.
      const left = x > C + R * 0.35;
      const lx = left ? x - dotSize(b) - 3 : x + dotSize(b) + 3;
      marks.push(
        `<text x="${lx.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${left ? 'end' : 'start'}" class="sky-label${isNamed ? ' named' : ''}">${b.name}</text>`,
      );
    }
  }
  const rings = [30, 60].map((alt) => `<circle cx="${C}" cy="${C}" r="${(((90 - alt) / 90) * R).toFixed(1)}" class="sky-ring" />`);
  const bg = sky.sun.alt > -0.833 ? 'sky-day' : sky.sun.alt > -12 ? 'sky-twilight' : 'sky-night';
  return raw(`<svg class="sky-chart ${bg}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Sky chart for ${sky.time.toISOString()}">
    <circle cx="${C}" cy="${C}" r="${R}" class="sky-disc" />
    ${rings.join('')}
    <line x1="${C}" y1="${C - R}" x2="${C}" y2="${C + R}" class="sky-ring" />
    <line x1="${C - R}" y1="${C}" x2="${C + R}" y2="${C}" class="sky-ring" />
    <text x="${C}" y="14" class="sky-cardinal" text-anchor="middle">N</text>
    <text x="${C}" y="${SIZE - 4}" class="sky-cardinal" text-anchor="middle">S</text>
    <text x="8" y="${C + 4}" class="sky-cardinal" text-anchor="middle">E</text>
    <text x="${SIZE - 8}" y="${C + 4}" class="sky-cardinal" text-anchor="middle">W</text>
    ${marks.join('')}
  </svg>`);
}

export function skySection(sky, named = new Set(), { note = '' } = {}) {
  const up = sky.bodies.filter((b) => b.alt > 0 && (b.kind !== 'star' || b.mag < 1 || named.has(b.name)));
  const namedDown = sky.bodies.filter((b) => b.alt <= 0 && named.has(b.name));
  const rows = [...up.slice(0, 9), ...namedDown];
  return html`<div class="sky-wrap">
      ${skyChartSvg(sky, named)}
      <div class="sky-side">
        <div class="sky-light">${sky.light.toUpperCase()} · Sun ${sky.sun.alt >= 0 ? `${Math.round(sky.sun.alt)}° up` : `${Math.round(-sky.sun.alt)}° below the horizon`}</div>
        <table class="sky-table">
          <thead><tr><th>OBJECT</th><th>WHERE</th><th title="Magnitude: lower is brighter">MAG</th></tr></thead>
          <tbody>${rows.map(
            (b) => html`<tr class="${named.has(b.name) ? 'named' : ''}">
              <td><span class="sky-dot" style="background:${KIND_COLOR[b.kind]}"></span>${b.name}</td>
              <td>${b.alt > 0 ? `${compass(b.az)} ${Math.round(b.alt)}°` : 'set'}</td>
              <td class="dim">${b.mag.toFixed(1).replace('-', '−')}</td>
            </tr>${b.note ? html`<tr class="sub"><td colspan="3">${b.note}</td></tr>` : ''}`,
          )}</tbody>
        </table>
      </div>
    </div>
    <p class="caveat">${named.size ? html`<span style="color:#ff5ce1">◯</span> circled: named in the official explanation. ` : ''}Chart: looking straight up, north at the top, east on the left; WHERE is compass direction and height above the horizon. Computed for the recorded time and place${note ? ` ${note}` : ''}; old reports can be off by minutes or hours.</p>`;
}
