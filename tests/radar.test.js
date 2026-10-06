import { describe, it, expect } from 'vitest';
import { blipPosition, plottable, radarSvg, RADAR_RANGE_KM } from '../src/ui/radar.js';

describe('the radar scope', () => {
  it('puts a blip at its bearing and distance with north up and east to the right', () => {
    expect(blipPosition(0, 0)).toEqual({ x: 0, y: 0 });
    expect(blipPosition(250, 0)).toEqual({ x: 0, y: -100 }); // due north, at the edge
    expect(blipPosition(125, 90)).toEqual({ x: 50, y: 0 }); // due east, half way
    const south = blipPosition(250, 180);
    expect(south.x).toBeCloseTo(0, 5);
    expect(south.y).toBe(100);
    expect(blipPosition(250, 270).x).toBe(-100);
  });

  it('keeps a blip inside the scope even if it is farther than the range', () => {
    const p = blipPosition(900, 45);
    expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(100.01);
    expect(blipPosition(-5, 90)).toEqual({ x: 0, y: 0 });
  });

  it('draws only records with a distance within range and a bearing', () => {
    expect(plottable({ distKm: 10, bearing: 20 })).toBe(true);
    expect(plottable({ distKm: 300, bearing: 20 })).toBe(false);
    expect(plottable({ distKm: 10 })).toBe(false);
    expect(plottable({ distKm: NaN, bearing: 5 })).toBe(false);
    expect(plottable({ distKm: 60, bearing: 5 }, 50)).toBe(false);
  });

  it('draws one link per record, named for screen readers, and nothing for none', () => {
    const svg = radarSvg([
      { href: '#/case/a', label: 'Case A, 1952', distKm: 40, bearing: 10, color: '#00d4ff' },
      { href: '#/bluebook/b&c', label: 'Blue "Book" <b>', distKm: 80, bearing: 200, color: '#ffb547' },
      { href: '#/case/far', label: 'Too far', distKm: 400, bearing: 0, color: '#fff' },
    ]);
    expect((svg.match(/<a /g) || []).length).toBe(2);
    expect(svg).toContain('aria-label="Radar view: 2 records within 250 km, north at the top"');
    expect(svg).toContain('aria-label="Case A, 1952"');
    expect(svg).toContain('href="#/bluebook/b&amp;c"');
    expect(svg).toContain('Blue &quot;Book&quot; &lt;b&gt;');
    expect(svg).not.toContain('Too far');
    expect(svg).toMatch(/<circle class="radar-ring" r="20"/); // the 50 km ring
    expect(svg).toMatch(/>250<\/text>/);
    expect(radarSvg([])).toBe('');
    expect(radarSvg([{ href: '#', label: 'x', distKm: RADAR_RANGE_KM + 1, bearing: 0, color: '#fff' }])).toBe('');
  });
});
