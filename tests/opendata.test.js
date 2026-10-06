import { describe, it, expect } from 'vitest';
import { openData, csvField, toCsv, caseRecord } from '../scripts/lib/open-data.mjs';
import { caseIndex, casePage, siteStructuredData, ldJson, decadeOf } from '../scripts/lib/case-pages.mjs';
import { shareTargets } from '../src/ui/sharelinks.js';
import { similarCases } from '../src/data/similar.js';
import { CASES } from '../src/data/cases/index.js';

const SITE = 'https://example.github.io/app/';
const ldOf = (page) => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(blocks).toHaveLength(1);
  return JSON.parse(blocks[0][1]);
};

describe('open data', () => {
  const data = openData(CASES, { site: SITE, version: '9.9', date: '2026-01-02' });

  it('exports every case, oldest first, with links back to the site', () => {
    const { records, cases, version } = JSON.parse(data.json);
    expect(cases).toBe(CASES.length);
    expect(version).toBe('9.9');
    expect(records).toHaveLength(CASES.length);
    expect(new Set(records.map((r) => r.id)).size).toBe(CASES.length);
    for (let i = 1; i < records.length; i++) expect(records[i - 1].date <= records[i].date).toBe(true);
    for (const r of records) {
      expect(r.page).toBe(`${SITE}case/${r.id}/`);
      expect(r.globe).toBe(`${SITE}#/case/${r.id}`);
      expect(r.year).toBe(Number(r.date.slice(0, 4)));
      expect(typeof r.summary).toBe('string');
      for (const s of r.sources) expect(s.url).toMatch(/^https?:\/\//);
    }
    expect(data.json).not.toMatch(/undefined|\[object Object\]|NaN/);
  });

  it('says when the time of day is a guess, in all three files', () => {
    const guessed = CASES.filter((c) => c.timeApprox);
    expect(guessed.length).toBeGreaterThan(0);
    const { records } = JSON.parse(data.json);
    for (const r of records) expect(r.timeApproximate, r.id).toBe(guessed.some((c) => c.id === r.id));
    const header = data.csv.split('\r\n')[0].split(',');
    expect(header[header.indexOf('date') + 1]).toBe('timeApproximate');
    const points = JSON.parse(data.geojson).features.filter((f) => f.geometry.type === 'Point');
    expect(points.filter((f) => f.properties.timeApproximate)).toHaveLength(guessed.length);
    expect(data.page).toContain('timeApproximate');
  });

  it('keeps each flight path with what it is based on, as longitude, latitude, altitude and time', () => {
    const nimitz = caseRecord(CASES.find((c) => c.id === 'nimitz-tic-tac-2004'), { site: SITE });
    const [track] = nimitz.tracks;
    expect(track.basis).toBeTruthy();
    expect(track.points[0]).toEqual({ longitude: -117.8, latitude: 31.3, altitudeM: 24384, seconds: 0, note: 'Princeton radar: object at ~80,000 ft' });
  });

  it('writes CSV that a spreadsheet reads back as one row per case', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField(null)).toBe('');
    expect(csvField(0)).toBe('0');
    // Text a spreadsheet would run as a formula is neutralised; a negative coordinate is a number and stays one.
    expect(csvField('=HYPERLINK("http://x.test","a")')).toBe(`"'=HYPERLINK(""http://x.test"",""a"")"`);
    for (const lead of ['+', '-', '@', '\t']) expect(csvField(`${lead}1`)).toBe(`'${lead}1`);
    expect(csvField(-33.9)).toBe('-33.9');
    expect(csvField('1952-07-19T21:30:00-04:00')).toBe('1952-07-19T21:30:00-04:00');
    // Count rows the way a CSV reader does: line breaks inside quotes don't end a row.
    let rows = 0;
    let quoted = false;
    for (const ch of data.csv) {
      if (ch === '"') quoted = !quoted;
      else if (ch === '\n' && !quoted) rows++;
    }
    expect(quoted).toBe(false);
    expect(rows).toBe(CASES.length + 1);
    expect(data.csv.split('\r\n')[0].split(',')).toContain('latitude');
    expect(toCsv([])).toBe(`${data.csv.split('\r\n')[0]}\r\n`);
  });

  it('writes GeoJSON with a point per case and a line per flight path', () => {
    const g = JSON.parse(data.geojson);
    expect(g.type).toBe('FeatureCollection');
    const points = g.features.filter((f) => f.geometry.type === 'Point');
    const lines = g.features.filter((f) => f.geometry.type === 'LineString');
    expect(points).toHaveLength(CASES.filter((c) => c.lat != null).length);
    expect(lines.length).toBe(CASES.reduce((n, c) => n + (c.tracks || []).filter((t) => t.points.length > 1).length, 0));
    for (const f of g.features) {
      const coords = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const [lon, lat] of coords) {
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      }
    }
  });

  it('lets a keyboard reach the parts of the page that scroll sideways on a phone', () => {
    // axe: scrollable-region-focusable. The fields table and the code sample overflow at phone width.
    const scrollers = data.page.match(/<(?:pre|div class="table")[^>]*>/g);
    expect(scrollers).toHaveLength(2);
    for (const tag of scrollers) expect(tag).toMatch(/ role="region" aria-label="[^"]+" tabindex="0">$/);
  });

  it('describes itself as a Dataset with the three downloads', () => {
    const ld = ldOf(data.page);
    expect(ld['@type']).toBe('Dataset');
    expect(ld.license).toMatch(/MIT/);
    expect(ld.distribution.map((d) => d.contentUrl)).toEqual([`${SITE}open-data/cases.json`, `${SITE}open-data/cases.csv`, `${SITE}open-data/cases.geojson`]);
    expect(ld.description.length).toBeGreaterThan(50);
    expect(data.page).not.toMatch(/undefined|\[object Object\]|NaN/);
  });
});

describe('the pages search engines read', () => {
  it('lists every case in the index, by decade, linked to its page', () => {
    const page = caseIndex(CASES, { site: SITE });
    for (const c of CASES) expect(page).toContain(`<a href="${c.id}/">`);
    const ld = ldOf(page);
    expect(ld.mainEntity.numberOfItems).toBe(CASES.length);
    expect(decadeOf('1561-04-14')).toBe('Before 1900');
    expect(decadeOf('1957-11-02')).toBe('1950s');
    expect(decadeOf('2024-12-01')).toBe('2020s');
  });

  it('gives each case page an Article with its place and date, and links to similar cases', () => {
    const c = CASES.find((x) => x.id === 'nimitz-tic-tac-2004');
    const similar = similarCases(c, CASES);
    const page = casePage(c, { site: SITE, card: true, similar });
    const ld = ldOf(page);
    const article = ld['@graph'].find((x) => x['@type'] === 'Article');
    expect(article.contentLocation.geo).toEqual({ '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lon });
    expect(article.temporalCoverage).toBe(c.date);
    expect(ld['@graph'].find((x) => x['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(3);
    for (const d of similar) expect(page).toContain(`<a href="../${d.id}/">`);
  });

  it('keeps structured data from closing its script tag', () => {
    expect(ldJson({ a: '</script><script>alert(1)</script>' })).not.toContain('</script>');
    expect(JSON.parse(ldJson({ a: '</script>' })).a).toBe('</script>');
  });

  it('gives the front page the site, the app and the dataset, with the current count', () => {
    const ld = siteStructuredData(CASES, { site: SITE });
    expect(ld['@graph'].map((x) => x['@type'])).toEqual(['WebSite', 'WebApplication', 'Dataset']);
    expect(ld['@graph'][1].featureList[0]).toContain(`${CASES.length} documented`);
  });
});

describe('share links', () => {
  it('starts a post on each site with the text and the link filled in', () => {
    const url = 'https://example.github.io/app/case/nimitz-tic-tac-2004/#globe';
    const targets = shareTargets({ url, title: 'USS Nimitz "Tic Tac" (2004)', text: 'Tic Tac & more' });
    expect(targets.map((s) => s.id)).toEqual(['x', 'reddit', 'bluesky', 'facebook', 'whatsapp', 'telegram', 'linkedin', 'email']);
    for (const s of targets) {
      // The link survives, encoded, in every one (the # included, so it opens on the globe).
      expect(decodeURIComponent(s.href)).toContain(url);
      expect(s.href).not.toContain(' ');
    }
    expect(targets.find((s) => s.id === 'x').href).toContain('text=Tic%20Tac%20%26%20more');
    expect(targets.find((s) => s.id === 'email').href).toMatch(/^mailto:\?subject=/);
  });
});
