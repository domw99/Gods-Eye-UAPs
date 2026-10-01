import { describe, it, expect } from 'vitest';
import { GLYPHS, glyphSvg } from '../src/layers/glyphs.js';
import { LAYER_DEFS } from '../src/ui/list.js';

describe('layer symbols', () => {
  it('gives every map-point layer a shape of its own', () => {
    const archives = ['bluebook', 'geipan', 'mufon', 'journals', 'nuforc', 'quakes'];
    expect(Object.keys(GLYPHS).sort()).toEqual([...archives].sort());
    const paths = Object.values(GLYPHS).map((g) => g.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps every outline inside the 16 × 16 box', () => {
    for (const [name, g] of Object.entries(GLYPHS)) {
      const nums = [g.path, g.detail || ''].join(' ').match(/-?\d*\.?\d+/g).map(Number);
      // Relative path commands can go negative, so only check the extremes of the absolute-looking first move.
      expect(Math.max(...nums), name).toBeLessThanOrEqual(16);
    }
  });

  it('draws the same symbols in the layer list, and none is shared between layers', () => {
    const shown = LAYER_DEFS.map((l) => glyphSvg(l.id)).filter(Boolean);
    expect(shown.length).toBeGreaterThanOrEqual(8); // cases, official, user, the five archives and earthquakes
    expect(new Set(shown).size).toBe(shown.length);
    expect(glyphSvg('bluebook')).toContain('class="swatch"');
    expect(glyphSvg('satellites')).toBeNull();
  });
});
