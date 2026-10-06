import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// axe cannot judge text that sits over the globe's canvas, so the dim text colour is
// checked here against the darkest and lightest panel backgrounds it is drawn on.
const css = readFileSync('src/styles/app.css', 'utf8');
const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const token = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`));
  return { rgb: m.slice(1, 4).map(Number), alpha: Number(m[4]) };
};

describe('text colours on the glass panels', () => {
  // Backgrounds measured under real text: modal and panel bodies, file cards, tinted (pressed) layer buttons.
  const panels = ['#090b13', '#101118', '#091721', '#0e1018'].map(hex);

  it.each(['text-dim', 'text-secondary'])('%s is at least 4.5:1 on every panel background', (name) => {
    const { rgb, alpha } = token(name);
    for (const bg of panels) {
      const blended = rgb.map((c, i) => c * alpha + bg[i] * (1 - alpha));
      expect(ratio(blended, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('does not fade the "made by" line a second time with opacity', () => {
    expect(css).not.toMatch(/^\.made-by\s*\{[^}]*opacity/m);
  });
});
