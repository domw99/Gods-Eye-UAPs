import { html, raw, mount, esc } from '../util/dom.js';

/**
 * The statistics view: what the archives hold, charted. Every chart is one
 * series, so identity never rests on colour: the archive rows are small
 * multiples with their names beside them, and the bar lists carry labels.
 */
const W = 640; // SVG user units; the SVG scales to its box

/** Row of stat tiles. */
export const tiles = (items) =>
  html`<div class="stat-row stats-tiles">${items.map(
    (t) => html`<div class="stat"><div class="v">${t.value}</div><div class="k">${t.label}</div></div>`,
  )}</div>`;

const compact = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : n.toLocaleString());

/**
 * Records per year, one small multiple per archive, each on its own scale
 * (their sizes differ a hundredfold). `rows`: [{ label, color, counts, from }]
 * where counts[i] is the count for year from + i.
 */
export function yearMultiples(rows, from, to) {
  const H = 38;
  const gap = 12;
  const left = 150;
  const right = 70;
  const plotW = W - left - right;
  const x = (y) => left + ((y - from) / (to - from)) * plotW;
  const height = rows.length * (H + gap) + 22;
  const parts = [];
  rows.forEach((r, i) => {
    const top = i * (H + gap);
    const vals = r.counts.slice(from - r.from, to - r.from + 1);
    const max = Math.max(1, ...vals);
    const peak = vals.indexOf(max);
    const y = (v) => top + H - (v / max) * H;
    const pts = vals.map((v, k) => `${x(from + k).toFixed(1)},${y(v).toFixed(1)}`);
    parts.push(
      `<text x="0" y="${top + H / 2 - 2}" class="sv-label">${esc(r.label)}</text>`,
      `<text x="0" y="${top + H / 2 + 12}" class="sv-sub">${r.total.toLocaleString()} total</text>`,
      `<line x1="${left}" x2="${W - right}" y1="${top + H}" y2="${top + H}" class="sv-base"/>`,
      `<path d="M${x(from)},${top + H} L${pts.join(' L')} L${x(to)},${top + H} Z" fill="${r.color}" fill-opacity="0.12"/>`,
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${r.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<circle cx="${x(from + peak)}" cy="${y(max)}" r="4" fill="${r.color}" stroke="#0a0f17" stroke-width="2"/>`,
      `<text x="${W - right + 8}" y="${top + 12}" class="sv-sub">peak ${compact(max)}</text>`,
      `<text x="${W - right + 8}" y="${top + 25}" class="sv-sub">${from + peak}</text>`,
    );
  });
  const axisY = rows.length * (H + gap) + 4;
  for (let yr = Math.ceil(from / 20) * 20; yr <= to; yr += 20)
    parts.push(`<text x="${x(yr)}" y="${axisY + 12}" class="sv-sub" text-anchor="middle">${yr}</text>`);
  // Hover: a vertical rule and the value in every row for the year under the pointer.
  parts.push(`<line class="sv-rule" x1="0" x2="0" y1="0" y2="${axisY}" visibility="hidden"/>`);
  parts.push(`<rect class="sv-hit" x="${left}" y="0" width="${plotW}" height="${axisY}" fill="transparent"/>`);
  return {
    svg: html`<svg class="stats-svg" viewBox="0 0 ${W} ${height}" role="img" aria-label="Records per year in each archive, ${from} to ${to}">${raw(parts.join(''))}</svg>`,
    bind(root, tooltip) {
      const svg = root.querySelector('.stats-svg');
      const rule = svg.querySelector('.sv-rule');
      const hit = svg.querySelector('.sv-hit');
      hit.addEventListener('pointermove', (e) => {
        const box = svg.getBoundingClientRect();
        const ux = ((e.clientX - box.left) / box.width) * W;
        const year = Math.round(from + ((ux - left) / plotW) * (to - from));
        if (year < from || year > to) return;
        rule.setAttribute('x1', x(year));
        rule.setAttribute('x2', x(year));
        rule.setAttribute('visibility', 'visible');
        tooltip.show(
          e,
          `<b>${year}</b>${rows.map((r) => `<br><i style="background:${r.color}"></i>${esc(r.label)}: ${(r.counts[year - r.from] || 0).toLocaleString()}`).join('')}`,
        );
      });
      hit.addEventListener('pointerleave', () => {
        rule.setAttribute('visibility', 'hidden');
        tooltip.hide();
      });
    },
  };
}

/**
 * Horizontal bars with the value at the tip. `items`: [{ label, value, hint?, strong? }].
 * `color` fills every bar; `strong` bars stay full colour when `emphasis` is on,
 * and the rest are muted.
 */
export function barList(items, { color, emphasis = false, unit = '' } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((n, i) => n + i.value, 0);
  return html`<div class="bar-list" role="list">${items.map((i) => {
    const pct = (i.value / max) * 100;
    const share = total ? Math.round((i.value / total) * 100) : 0;
    const fill = emphasis && !i.strong ? 'rgba(232,234,237,0.22)' : color;
    return html`<div class="bar-row" role="listitem" title="${i.hint || i.label}: ${i.value.toLocaleString()}${unit} (${share}%)">
      <span class="bar-label">${i.label}</span>
      <span class="bar-track"><i style="width:${pct.toFixed(1)}%;background:${fill}"></i></span>
      <span class="bar-value">${i.value.toLocaleString()}${emphasis ? html` <span class="dim">${share}%</span>` : ''}</span>
    </div>`;
  })}</div>`;
}

/** A small floating tooltip for the charts. */
export function makeTooltip(root) {
  const el = document.createElement('div');
  el.className = 'stats-tip hidden';
  root.appendChild(el);
  return {
    show(e, htmlText) {
      el.innerHTML = htmlText;
      el.classList.remove('hidden');
      const box = root.getBoundingClientRect();
      const x = Math.min(e.clientX - box.left + 14, box.width - el.offsetWidth - 8);
      el.style.left = `${Math.max(8, x)}px`;
      el.style.top = `${e.clientY - box.top + root.scrollTop + 14}px`;
    },
    hide() {
      el.classList.add('hidden');
    },
  };
}

/** A plain table of the same numbers, for screen readers and copying. */
export const dataTable = (caption, head, rows) =>
  html`<details class="stats-table"><summary>Show as a table</summary><table><caption>${caption}</caption><thead><tr>${head.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${rows.map(
    (r) => html`<tr>${r.map((c) => html`<td>${typeof c === 'number' ? c.toLocaleString() : c}</td>`)}</tr>`,
  )}</tbody></table></details>`;

export { mount };
