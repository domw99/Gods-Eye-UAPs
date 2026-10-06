import { describe, it, expect } from 'vitest';
import { embedUrl, withoutEmbed, embedSnippet } from '../src/app/links.js';

describe('embedding the app in another page', () => {
  it('adds the embed flag and keeps the place in the app', () => {
    expect(embedUrl('https://x.github.io/app/#/case/nimitz-tic-tac-2004')).toBe('https://x.github.io/app/?embed=1#/case/nimitz-tic-tac-2004');
    expect(embedUrl('https://x.github.io/app/?mode=nvg&embed=0#/moon')).toBe('https://x.github.io/app/?mode=nvg&embed=1#/moon');
  });

  it('takes the flag off again for the link to the full app', () => {
    expect(withoutEmbed('https://x.github.io/app/?embed=1#/case/a')).toBe('https://x.github.io/app/#/case/a');
    expect(withoutEmbed('https://x.github.io/app/?mode=nvg&embed=1')).toBe('https://x.github.io/app/?mode=nvg');
    expect(withoutEmbed(embedUrl('https://x.test/#/geipan/1981-01-00849'))).toBe('https://x.test/#/geipan/1981-01-00849');
  });

  it('makes an iframe that is safe to paste, with a title for screen readers', () => {
    const html = embedSnippet('https://x.github.io/app/?embed=1#/case/a', 'USS Nimitz "Tic Tac" (2004)');
    expect(html.startsWith('<iframe src="https://x.github.io/app/?embed=1#/case/a"')).toBe(true);
    expect(html).toContain('title="God\'s Eye // UAP: USS Nimitz &quot;Tic Tac&quot; (2004)"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('allow="fullscreen"');
    expect(html.endsWith('</iframe>')).toBe(true);
    expect(html).not.toMatch(/<[^>]*<[a-z]/i); // nothing from the title can open a tag
    expect(embedSnippet('https://x.test/?a=1&b=2', '<script>')).toContain('src="https://x.test/?a=1&amp;b=2"');
    expect(embedSnippet('https://x.test/', '<script>')).toContain('&lt;script&gt;');
  });
});
