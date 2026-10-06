import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { redactContacts, hasContact } from '../scripts/lib/redact.mjs';
import { quote } from '../scripts/build-mufon.mjs';

describe('contact details in archive quotes', () => {
  it('takes out e-mail addresses, also with spaces around the @ that OCR leaves', () => {
    expect(redactContacts('write to ibishop@hotmail.com today')).toBe('write to [email removed] today');
    expect(redactContacts('Editor@mufon.com or ufo-updates-bounces@virtuallystrange.net')).toBe('[email removed] or [email removed]');
    expect(redactContacts('spr100 @ aol.com')).toBe('[email removed]');
  });

  it('takes out phone numbers in the usual forms', () => {
    for (const phone of ['(602) 837-0062', '602-837-0062', '602.837.0062', '602 837 0062', '1-800-555-0100', '+1 602 837 0062', '+44 20 7946 0958', '(614-468-2127']) {
      expect(redactContacts(`call ${phone} now`), phone).toMatch(/call .*\[number removed\].* now/);
      expect(hasContact(`call ${phone} now`), phone).toBe(true);
    }
  });

  it('leaves dates, years, page numbers, coordinates and ordinary numbers alone', () => {
    for (const text of ['1952-07-08', 'June 1967 p. 10', 'JAN. 22-23 and Feb. 19-20', '40.7128, -74.0060', '33°23′39″N 104°31′23″W', 'Flight 1628 at 35,000 ft, speed 1,200 mph', 'Blue Book case 1947-1969', 'NUMBER 323 1995', 'Issue 12/53 of 1990, 300/1200 baud', 'ZIP 90210 and 2400 bps']) {
      expect(hasContact(text), text).toBe(false);
      expect(redactContacts(text), text).toBe(text);
    }
  });

  it('is safe on odd input', () => {
    expect(redactContacts(null)).toBe('');
    expect(redactContacts(undefined)).toBe('');
    expect(redactContacts(42)).toBe('42');
    expect(hasContact('')).toBe(false);
    const long = 'a'.repeat(5000);
    const t0 = Date.now();
    redactContacts(long);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('is applied to every quote the archive builders cut', () => {
    const page = 'The group meets monthly in Tucson, Arizona. Call Bill Freeman at 205-854-2308 or e-mail bill@example.org for the next meeting.';
    const q = quote(page, page.indexOf('Tucson'), 'Tucson'.length, 200);
    expect(q).toContain('Tucson');
    expect(q).not.toMatch(/854-2308|bill@example/);
    expect(q).toContain('[number removed]');
    expect(q).toContain('[email removed]');
  });

  it('is true of the data we ship: no address or number in any stored quote', () => {
    const walk = (v, fn) => {
      if (typeof v === 'string') fn(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
      else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, fn));
    };
    for (const file of ['mufon', 'journals']) {
      const bad = [];
      walk(JSON.parse(readFileSync(`public/data/${file}.json`, 'utf8')), (s) => {
        if (s.length < 4000 && hasContact(s)) bad.push(s.slice(0, 80));
      });
      expect(bad, file).toEqual([]);
    }
  });
});
