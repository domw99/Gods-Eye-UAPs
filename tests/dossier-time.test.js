import { describe, it, expect, beforeAll } from 'vitest';

// The i18n module only touches the document to set <html lang/dir>; give it a stand-in.
globalThis.document = { documentElement: { dataset: {} }, body: null };
globalThis.localStorage = { setItem() {}, getItem: () => null };
const { LANGUAGES, setLanguage } = await import('../src/i18n/index.js');
const { localAndUtc } = await import('../src/util/when.js');

describe('the date line of a case file', () => {
  beforeAll(() => setLanguage('en', { save: false }));

  it('gives the local time and the UTC time', async () => {
    await setLanguage('en', { save: false });
    expect(localAndUtc('1997-03-13T19:55:00-07:00')).toBe('13 Mar 1997, 19:55 local (UTC−07:00) · 02:55 UTC');
    expect(localAndUtc('1883-08-12T08:00:00-06:50')).toMatch(/08:00 local \(UTC−06:50\) · 14:50 UTC/);
  });

  it('shows no UTC time, in any language, when the time of day is a guess', async () => {
    for (const { code } of LANGUAGES) {
      await setLanguage(code, { save: false });
      const line = localAndUtc('2004-11-14T14:00:00-08:00', true);
      expect(line, code).toContain('~14:00');
      expect(line, code).not.toMatch(/22:00/);
    }
  });
});
