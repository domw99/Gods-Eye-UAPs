/**
 * Map symbols for the archive layers. Case files are rings, official releases
 * diamonds and your own sightings triangles (layers/items.js); each archive
 * gets a shape of its own in the same style (a dark disc behind a glowing
 * outline and a bright centre):
 *
 *   Blue Book        a file with a folded corner
 *   GEIPAN           a shield
 *   MUFON files      a hexagon
 *   Research archives  an open book
 *   Civilian reports a four-point spark
 *
 * The outlines are SVG paths in a 16 × 16 box, so the same shapes draw on the
 * map (canvas) and in the layer list (inline SVG).
 */
export const GLYPHS = {
  bluebook: { path: 'M4.3 1.8h5.3l2.9 2.9v9.5H4.3z', detail: 'M9.6 1.8v2.9h2.9', dot: [8.4, 9.4] },
  geipan: { path: 'M8 1.6l5.2 1.9v4.6c0 3-2.2 5.1-5.2 6.4-3-1.3-5.2-3.4-5.2-6.4V3.5z', detail: null, dot: [8, 7.7] },
  mufon: { path: 'M8 1.7l5.4 3.15v6.3L8 14.3l-5.4-3.15v-6.3z', detail: null, dot: [8, 8] },
  journals: { path: 'M1.8 4c2-.8 4.2-.8 6.2.7 2-1.5 4.2-1.5 6.2-.7v8.1c-2-.8-4.2-.8-6.2.7-2-1.5-4.2-1.5-6.2-.7z', detail: 'M8 4.7v8.1', dot: null },
  nuforc: { path: 'M8 1.4L9.7 6.3 14.6 8 9.7 9.7 8 14.6 6.3 9.7 1.4 8 6.3 6.3z', detail: null, dot: [8, 8] },
};

const cache = new Map();
const PX = 2; // drawn at twice the size so the symbols stay sharp on high-DPI screens

/**
 * The symbol for a layer as a data URL, drawn in white so a billboard can tint
 * it with its own colour (the dark backdrop stays dark). Returned as a URL so
 * Cesium keeps one texture for every marker that uses it.
 */
export function glyphUrl(layer) {
  if (cache.has(layer)) return cache.get(layer);
  const shape = GLYPHS[layer];
  const size = 24;
  const c = document.createElement('canvas');
  c.width = c.height = size * PX;
  const g = c.getContext('2d');
  g.scale((size * PX) / 16, (size * PX) / 16);
  const path = new Path2D(shape.path);
  // A dark backdrop keeps the symbol readable over snow, desert and cloud.
  g.fillStyle = 'rgba(4, 8, 14, 0.6)';
  g.fill(path);
  g.globalAlpha = 0.22;
  g.fillStyle = '#fff';
  g.fill(path);
  g.globalAlpha = 1;
  g.shadowColor = '#fff';
  g.shadowBlur = 5 * PX;
  g.strokeStyle = '#fff';
  g.lineWidth = 1.3;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke(path);
  g.shadowBlur = 0;
  if (shape.detail) g.stroke(new Path2D(shape.detail));
  if (shape.dot) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(shape.dot[0], shape.dot[1], 1.2, 0, Math.PI * 2);
    g.fill();
  }
  const url = c.toDataURL();
  cache.set(layer, url);
  return url;
}

// The markers drawn in layers/items.js, for the layer list.
const LIST_ONLY = {
  cases: { path: 'M8 2.4a5.6 5.6 0 1 1 0 11.2A5.6 5.6 0 0 1 8 2.4z', detail: null, dot: [8, 8] },
  official: { path: 'M8 1.8l6.2 6.2L8 14.2 1.8 8z', detail: null, dot: [8, 8] },
  user: { path: 'M8 2l6 11H2z', detail: null, dot: [8, 9.6] },
};

/** The symbol for a layer as an inline SVG string (outline in the current colour), for the layer list; null when it has none. */
export function glyphSvg(layer) {
  const shape = GLYPHS[layer] || LIST_ONLY[layer];
  if (!shape) return null;
  return `<svg class="swatch" viewBox="0 0 16 16" aria-hidden="true"><path d="${shape.path}" class="body" />${
    shape.detail ? `<path d="${shape.detail}" class="line" />` : ''
  }${shape.dot ? `<circle cx="${shape.dot[0]}" cy="${shape.dot[1]}" r="1.1" class="dot" />` : ''}</svg>`;
}
