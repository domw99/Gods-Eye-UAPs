import { describe, it, expect, afterAll, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 }); // a language's dictionary is loaded the first time it is chosen, which is slow on a busy machine

// i18n only touches the document to set <html lang/dir>; give it a stand-in.
globalThis.document = { documentElement: { dataset: {} }, body: null };
globalThis.localStorage = { setItem() {}, getItem: () => null };
const { LANGUAGES, setLanguage } = await import('../src/i18n/index.js');
const { rankCandidates, HEIGHTS, MOTIONS, confidenceLabel } = await import('../src/services/explain.js');
const { skyAt } = await import('../src/services/sky.js');
const { auroraChance } = await import('../src/services/geomagnetic.js');

const others = LANGUAGES.filter((l) => l.code !== 'en').map((l) => l.code);
const locales = {};
for (const code of others) locales[code] = (await import(`../src/i18n/locales/${code}.js`)).default;

/** Every kind of candidate the checker can give, in whatever language is current. */
function everything() {
  const moon = skyAt(0, 0, '2024-01-25T20:00:00Z', { minAlt: -90 }).bodies.find((b) => b.name === 'Moon');
  const dark = {
    sun: { alt: -20, az: 300 },
    bodies: [
      { name: 'Venus', kind: 'planet', alt: 12, az: 250, mag: -4.3 },
      { name: 'Sirius', kind: 'star', alt: 8, az: 140, mag: -1.46 },
      { ...moon, alt: 40, az: 100 },
    ],
  };
  const twilight = { sun: { alt: -8, az: 280 }, bodies: [] };
  const sats = [
    { name: 'ISS (ZARYA)', group: 'Space stations', azimuth: 250, elevation: 30, sunlit: true },
    { name: 'TIANGONG', group: 'Brightest satellites', azimuth: 255, elevation: 35, sunlit: true },
    ...Array.from({ length: 8 }, (_, i) => ({ name: `STARLINK-${i}`, group: 'Starlink', azimuth: 250 + i, elevation: 30, sunlit: true })),
  ];
  const field = { name: 'Minot Air Force Base', code: 'KMIB', size: 1, military: true, km: 6, bearing: 90 };
  const london = auroraChance(27, 51.5, -0.12);
  const roswell = auroraChance(27, 33.4, -104.5);
  const looked = { az: 250, alt: 12, motion: 'still', bright: true, colours: true, blinking: true };
  const runs = [
    rankCandidates({ report: looked, sky: dark, satellites: sats, weather: { cloud_cover: 95, wind_speed_100m: 15, wind_direction_100m: 270 }, airfields: [field], aurora: { ...london, thirds: 27 } }),
    rankCandidates({ report: { motion: 'drift', orange: true, towardAz: 90 }, sky: dark, weather: { wind_speed_100m: 15, wind_direction_100m: 270 }, airfields: [{ ...field, military: false, km: 30 }] }),
    rankCandidates({ report: { motion: 'drift', towardAz: 0 }, sky: dark, weather: { wind_speed_10m: 15, wind_direction_10m: 270 }, airfields: [] }),
    rankCandidates({ report: { motion: 'steady' }, sky: twilight, launches: [{ name: 'Falcon 9 | Starlink', gapMin: -12, km: 400 }, { name: 'Soyuz', gapMin: 100, km: 2200 }] }),
    rankCandidates({ report: { motion: 'still', colours: true, az: 0, alt: 10 }, sky: dark, aurora: { ...roswell, thirds: 27 } }),
    rankCandidates({ report: { motion: 'still', colours: true, az: 180, alt: 10 }, sky: dark, aurora: { ...roswell, thirds: 20, south: true } }),
  ];
  return runs.flat();
}

afterAll(() => setLanguage('en', { save: false }));

describe('the checker speaks the interface language', () => {
  it('has the form labels and match labels in every language', () => {
    const labels = [...Object.values(HEIGHTS).map((h) => h.label), ...Object.values(MOTIONS), ...[0.9, 0.5, 0.1].map(confidenceLabel)];
    expect(labels).toHaveLength(12);
    for (const [code, dict] of Object.entries(locales)) for (const label of labels) expect(dict[label], `${code}: ${label}`).toBeTruthy();
  });

  it('is unchanged in English, and writes "an extreme storm"', async () => {
    await setLanguage('en', { save: false });
    const all = everything();
    expect(all.map((c) => c.kind)).toEqual(expect.arrayContaining(['planet', 'star', 'moon', 'satellite', 'drift', 'aircraft', 'launch', 'aurora']));
    const aurora = all.find((c) => c.kind === 'aurora');
    expect(aurora.reason).toMatch(/Kp 9o, an extreme storm \(G5\)\. The aurora's edge reached about \d+° geomagnetic latitude and you were at about \d+°, so it could have been overhead\. /);
    expect(all.find((c) => c.name === 'Starlink train').reason).toMatch(/^8 sunlit Starlink satellites were in that part of the sky\. /);
    expect(all.find((c) => c.kind === 'moon').reason).toMatch(/Full Moon, \d+% lit/);
  });

  it.each(others)('has every sentence translated in %s', async (code) => {
    await setLanguage('en', { save: false });
    const english = everything();
    await setLanguage(code, { save: false });
    const local = everything();
    expect(local).toHaveLength(english.length);
    local.forEach((c, i) => {
      expect(c.kind).toBe(english[i].kind);
      expect(c.score).toBe(english[i].score); // only the words change
      expect(c.reason, `${code} ${c.kind}`).not.toBe(english[i].reason);
      expect(c.reason, `${code} ${c.kind}`).not.toMatch(/[{}]/);
      expect(c.reason).not.toMatch(/undefined|NaN/);
    });
    for (const name of ['Starlink train', 'Balloon or lantern', 'Sky lanterns (flickering orange)', 'Aircraft or drone']) {
      const found = local.find((c, i) => english[i].name === name);
      if (found) expect(found.name, `${code}: ${name}`).not.toBe(name);
    }
  });
});
