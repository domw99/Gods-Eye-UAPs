import { describe, it, expect } from 'vitest';
import { collectLinks, classify } from '../scripts/check-links.mjs';

describe('link checker', () => {
  it('collects each cited URL once, with every place that cites it', () => {
    const links = collectLinks(
      [
        { id: 'a', sources: [{ url: 'https://x.org/1' }, { url: 'https://x.org/2' }] },
        { id: 'b', sources: [{ url: 'https://x.org/1' }, { url: 'mailto:someone' }] },
      ],
      [{ title: 'Files', links: [{ url: 'https://y.org/' }] }],
    );
    expect(links).toEqual([
      { url: 'https://x.org/1', where: ['case a', 'case b'] },
      { url: 'https://x.org/2', where: ['case a'] },
      { url: 'https://y.org/', where: ['files: Files'] },
    ]);
  });

  it('tells broken links from sites that refuse robots', () => {
    expect(classify(200)).toBe('ok');
    expect(classify(301)).toBe('ok');
    expect(classify(403)).toBe('blocked');
    expect(classify(429)).toBe('blocked');
    expect(classify(404)).toBe('broken');
    expect(classify(500)).toBe('broken');
  });

  it('finds the real case and library links', () => {
    const links = collectLinks();
    expect(links.length).toBeGreaterThan(40);
    expect(links.every((l) => /^https?:\/\//.test(l.url))).toBe(true);
  });
});
