import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseAproId, parseIurName, parseNicap, dateFromText, pagesFromDjvuXml } from '../scripts/build-journals.mjs';
import { decodeJournals, SERIES_SHORT } from '../src/services/journals.js';
import { issueDate, issueLabel, readerUrl, embedUrl, pdfUrl, pageNumber } from '../src/services/mufon.js';

describe('research archive build', () => {
  it('reads APRO Bulletin identifiers', () => {
    expect(parseAproId('AFU_19770800_APRO_Bulletin_v26_n2')).toEqual({ year: 1977, month: 8, monthTo: null, number: 'Vol. 26 No. 2' });
    expect(parseAproId('AFU_19740700_APRO_Bulletin_July-August')).toEqual({ year: 1974, month: 7, monthTo: 8, number: null });
    expect(parseAproId('AFU_19560915_APRO_Bulletin_Sept_AFU')).toMatchObject({ year: 1956, month: 9 });
    expect(parseAproId('apro-24-9-1976')).toBeNull();
  });

  it('reads International UFO Reporter file names, including undated quarterlies', () => {
    expect(parseIurName('Volume 13, number 1 _January_February 1988')).toEqual({ year: 1988, month: 1, monthTo: 2, number: 'Vol. 13 No. 1' });
    expect(parseIurName('IUR Vol. 28 No. 1 Spring 2003')).toMatchObject({ year: 2003, month: 3 });
    expect(parseIurName('IUR Vol. 29 No. 4')).toMatchObject({ year: 2004, month: 12 });
    expect(parseIurName('Frontiers of Science 2_5 _July_August 1980')).toBeNull();
  });

  it('reads NICAP issue dates and numbers', () => {
    expect(parseNicap('sim_u-f-o-investigator_february-march-1959_4_10', '1959-02', 'The U.F.O. Investigator February - March 1959: Vol 4 Iss 10')).toEqual({
      year: 1959, month: 2, monthTo: 3, number: 'Vol. 4 No. 10',
    });
    expect(parseNicap('x', null)).toBeNull();
  });

  it('dates an undated newsletter from its first pages', () => {
    expect(dateFromText(['MUFON of Ohio Newsletter', 'March 1994 issue. Reports from 1993 and 1994. Meeting 1994.'])).toEqual({ year: 1994, month: 3 });
    expect(dateFromText(['no dates here'])).toBeNull();
    expect(dateFromText(['Printed 2031'], 2026)).toBeNull();
  });

  it('splits djvu.xml into pages of lines', () => {
    const xml = `<DjVuXML><BODY><OBJECT><LINE><WORD>Saw</WORD><WORD>a</WORD><WORD>light</WORD></LINE><LINE><WORD>AT&amp;T</WORD></LINE></OBJECT><OBJECT><LINE><WORD>Page&#32;2</WORD></LINE></OBJECT></BODY></DjVuXML>`;
    expect(pagesFromDjvuXml(xml)).toEqual(['Saw a light AT&T', 'Page 2']);
  });
});

describe('archive page links', () => {
  const own = { id: 'AFU_19600100_APRO_Bulletin_January', item: 'AFU_19600100_APRO_Bulletin_January', file: 'AFU_19600100_APRO_Bulletin_January', sub: false, year: 1960, month: 1, title: 'APRO Bulletin', number: null, cover: false };
  const inner = { id: 'iur/IUR Vol. 28 No. 1 Spring 2003', item: 'iur-vol.-31-no.-4', file: 'IUR Vol. 28 No. 1 Spring 2003', sub: true, year: 2003, month: 3, title: 'International UFO Reporter', number: 'Vol. 28 No. 1', cover: false };
  const mufon = { id: '1978_01', year: 1978, month: 1, title: 'MUFON UFO Journal', number: 122, cover: true };

  it('builds reader, embed and PDF links for each kind of scan', () => {
    expect(readerUrl(own, 2)).toBe('https://archive.org/details/AFU_19600100_APRO_Bulletin_January/page/n2/mode/1up');
    expect(embedUrl(inner, 0)).toBe('https://archive.org/embed/iur-vol.-31-no.-4/IUR%20Vol.%2028%20No.%201%20Spring%202003/page/n0/mode/1up');
    expect(pdfUrl(inner)).toBe('https://archive.org/download/iur-vol.-31-no.-4/IUR%20Vol.%2028%20No.%201%20Spring%202003.pdf');
    expect(readerUrl(mufon, 3)).toBe('https://archive.org/details/MUFON_UFO_Journal_-_Skylook/1978_01/page/n3/mode/1up');
  });

  it('labels issues with or without a month or number', () => {
    expect(issueLabel(inner)).toBe('International UFO Reporter Vol. 28 No. 1, March 2003');
    expect(issueLabel(mufon)).toBe('MUFON UFO Journal No. 122, January 1978');
    expect(issueDate({ year: 1985, month: null })).toBe('1985');
    expect(pageNumber(own, 0)).toBe(1);
  });
});

const DATA = new URL('../public/data/journals.json', import.meta.url);
describe.runIf(existsSync(DATA))('research archive dataset', () => {
  let j;
  beforeAll(() => {
    j = decodeJournals(JSON.parse(readFileSync(DATA, 'utf8')));
  });

  it('covers the four series with dated issues', () => {
    const bySeries = {};
    for (const is of j.issues) bySeries[is.series] = (bySeries[is.series] || 0) + 1;
    expect(bySeries.apro).toBeGreaterThan(150);
    expect(bySeries.iur).toBeGreaterThan(80);
    expect(bySeries.nicap).toBeGreaterThan(10);
    expect(bySeries.chapters).toBeGreaterThan(200);
    for (const is of j.issues) {
      expect(Object.keys(SERIES_SHORT), is.id).toContain(is.series);
      expect(is.year, is.id).toBeGreaterThanOrEqual(1947);
      expect(is.year, is.id).toBeLessThanOrEqual(new Date().getUTCFullYear());
      expect(is.pages, is.id).toBeGreaterThan(0);
      expect(['hocr', 'djvu'], is.id).toContain(is.text);
    }
    expect(j.byIssueId.size).toBe(j.issues.length);
  });

  it('places point at a page of their issue, with a quote', () => {
    expect(j.records.length).toBeGreaterThan(1000);
    for (const r of j.records) {
      const is = j.issues[r.issue];
      expect(r.leaf, `${is.id} ${r.place}`).toBeLessThan(is.pages);
      expect(Math.abs(r.lat)).toBeLessThanOrEqual(90);
      expect(r.quote.length).toBeGreaterThan(20);
      expect(r.quote.length).toBeLessThan(400);
    }
  });

  it('matches pages to curated cases', () => {
    expect(Object.keys(j.cases).length).toBeGreaterThan(20);
    for (const [id, c] of Object.entries(j.cases))
      for (const [ii, leaf] of c.hits) expect(leaf, id).toBeLessThan(j.issues[ii].pages);
  });
});
