import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const main = readFileSync('src/main.js', 'utf8');
// The names ?open= understands, read from the table in main.js.
const targets = [...main.match(/const OPEN_TARGETS = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);

describe('the app manifest', () => {
  it('has shortcuts, as many as phones show, each with a name, a link inside the app and an icon that exists', () => {
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(2);
    expect(manifest.shortcuts.length).toBeLessThanOrEqual(4);
    for (const s of manifest.shortcuts) {
      expect(s.name, s.url).toBeTruthy();
      expect(s.short_name.length, s.url).toBeLessThanOrEqual(16);
      expect(s.url.startsWith('./'), s.url).toBe(true);
      for (const icon of s.icons) expect(existsSync(`public/${icon.src}`), icon.src).toBe(true);
    }
  });

  it('points each ?open= shortcut at a screen the app opens', () => {
    expect(targets).toEqual(expect.arrayContaining(['explain', 'files', 'random', 'stats', 'space', 'log']));
    for (const s of manifest.shortcuts) {
      const open = new URL(s.url, 'https://x.test/').searchParams.get('open');
      if (open) expect(targets, s.url).toContain(open);
    }
  });

  it('keeps shortcuts inside the app scope', () => {
    for (const s of manifest.shortcuts) expect(new URL(s.url, 'https://x.test/app/').pathname).toBe('/app/');
  });
});
