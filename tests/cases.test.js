import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CASES } from '../src/data/cases/index.js';
import { EVIDENCE, STATUS, CATEGORY, TRACK_KINDS, TRACK_BASIS, PRECISION, shapeClasses, evidenceScore } from '../src/data/taxonomy.js';
import { trackStats } from '../src/layers/tracks.js';
import { haversineKm } from '../src/util/geo.js';

describe('curated case files', () => {
  it('has unique ids', () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const c of CASES) {
    describe(c.id, () => {
      it('has required, well-formed fields', () => {
        expect(c.title).toBeTruthy();
        expect(c.summary.length).toBeGreaterThan(60);
        expect(Number.isNaN(Date.parse(c.date))).toBe(false);
        expect(c.date).toMatch(/[+-]\d{2}:\d{2}$/); // local offset recorded
        if ('timeApprox' in c) expect(c.timeApprox).toBe(true);
        if (c.end) expect(Date.parse(c.end)).toBeGreaterThanOrEqual(Date.parse(c.date));
        expect(c.lat).toBeGreaterThanOrEqual(-90);
        expect(c.lat).toBeLessThanOrEqual(90);
        expect(c.lon).toBeGreaterThanOrEqual(-180);
        expect(c.lon).toBeLessThanOrEqual(180);
        expect(Object.keys(PRECISION)).toContain(c.precision);
        expect(Object.keys(STATUS)).toContain(c.status);
        expect(Object.keys(CATEGORY)).toContain(c.category);
        expect(c.evidence.length).toBeGreaterThan(0);
        for (const e of c.evidence) expect(Object.keys(EVIDENCE)).toContain(e);
      });

      it('explains non-unresolved assessments', () => {
        if (c.status !== 'unresolved') expect(c.explanation?.length).toBeGreaterThan(20);
      });

      it('references media in a known form', () => {
        for (const m of c.media || []) {
          const kinds = ['commons', 'dvids', 'ia'].filter((k) => m[k]);
          expect(kinds.length).toBe(1);
          if (m.commons) expect(m.commons).toMatch(/^File:.+\.\w{3,4}$/);
          if (m.dvids) expect(m.dvids).toMatch(/^\d{5,8}$/);
          if (m.page) {
            expect(m.commons).toMatch(/\.pdf$/i);
            expect(Number.isInteger(m.page) && m.page >= 1).toBe(true);
          }
        }
        for (const s of c.sources || []) expect(s.url).toMatch(/^https?:\/\//);
      });

      for (const t of c.tracks || []) {
        it(`track "${t.label}" is plausible`, () => {
          expect(Object.keys(TRACK_KINDS)).toContain(t.kind);
          expect(Object.keys(TRACK_BASIS)).toContain(t.basis);
          expect(t.points.length).toBeGreaterThanOrEqual(2);
          for (let i = 0; i < t.points.length; i++) {
            const [lon, lat, alt, time] = t.points[i];
            expect(Math.abs(lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(lon)).toBeLessThanOrEqual(180);
            expect(alt).toBeGreaterThanOrEqual(0);
            expect(alt).toBeLessThan(300_000);
            if (i) expect(time).toBeGreaterThanOrEqual(t.points[i - 1][3]); // time never runs backwards
          }
          // Every track stays in the neighbourhood of its case (≤ 3,000 km),
          // except long-haul balloon tracks.
          if (t.kind !== 'balloon')
            for (const [lon, lat] of t.points) expect(haversineKm(c.lat, c.lon, lat, lon)).toBeLessThan(3000);
          const st = trackStats(t);
          expect(st.length).toBeGreaterThanOrEqual(0);
        });
      }
    });
  }
});

/**
 * Checks that read the whole list at once. A failing one names every case that
 * breaks the rule, so a new case file can be fixed in one pass.
 */
describe('case data, across all cases', () => {
  const json =(name) => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));

  it('puts the year of the date at the end of every id (the recurring lights have none)', () => {
    // The wave began in 1983 and the video is from July 1984; the id is a published permalink (cards, journal links).
    const kept = new Set(['hudson-valley-1983']);
    const bad = [];
    for (const c of CASES) {
      const m = /-(\d{4})$/.exec(c.id);
      if (!m) {
        if (c.category !== 'recurring-lights') bad.push(`${c.id}: no year`);
      } else if (+m[1] !== +c.date.slice(0, 4) && !kept.has(c.id)) bad.push(`${c.id}: id says ${m[1]}, date says ${c.date.slice(0, 4)}`);
    }
    expect(bad).toEqual([]);
  });

  it('uses real calendar days and clock offsets that a time zone can have', () => {
    const bad = [];
    for (const c of CASES) {
      for (const field of ['date', 'end']) {
        const iso = c[field];
        if (iso == null) continue;
        const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)([+-])(\d\d):(\d\d)$/.exec(iso);
        if (!m) {
          bad.push(`${c.id} ${field}: not YYYY-MM-DDThh:mm:ss±hh:mm`);
          continue;
        }
        const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
        const day = new Date(Date.UTC(y, mo - 1, d));
        if (day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d || h > 23 || mi > 59) bad.push(`${c.id} ${field}: ${iso} is not a real moment`);
        // Zacatecas kept local mean time (UTC−6:50) until 1922; every other offset is a whole zone.
        if (+m[8] > 14 || (![0, 15, 30, 45].includes(+m[9]) && c.id !== 'bonilla-zacatecas-1883')) bad.push(`${c.id} ${field}: odd offset ${m[7]}${m[8]}:${m[9]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('marks the time of day as approximate for accounts from before 1800', () => {
    // The broadsheets say "at sunrise", not a clock time.
    const bad = CASES.filter((c) => +c.date.slice(0, 4) < 1800 && c.timeApprox !== true).map((c) => c.id);
    expect(bad).toEqual([]);
  });

  it('uses XX only for cases that name a region and no country', () => {
    expect(CASES.filter((c) => c.cc === 'XX' && c.precision !== 'region').map((c) => c.id)).toEqual([]);
  });

  it('gives each case unique track ids and labels, and no source twice', () => {
    const bad = [];
    for (const c of CASES) {
      const ids = (c.tracks || []).map((t) => t.id);
      const labels = (c.tracks || []).map((t) => t.label);
      if (new Set(ids).size !== ids.length) bad.push(`${c.id}: repeated track id`);
      if (new Set(labels).size !== labels.length) bad.push(`${c.id}: repeated track label`);
      const urls = (c.sources || []).map((s) => s.url);
      if (new Set(urls).size !== urls.length) bad.push(`${c.id}: the same source twice`);
      for (const s of c.sources || []) if (!['official', 'primary', 'analysis', 'reference'].includes(s.kind)) bad.push(`${c.id}: source kind "${s.kind}"`);
    }
    expect(bad).toEqual([]);
  });

  it('keeps track times at or after the case time, and ending with the case', () => {
    const bad = [];
    for (const c of CASES) {
      const span = c.end ? (Date.parse(c.end) - Date.parse(c.date)) / 1000 : Infinity;
      for (const t of c.tracks || []) {
        const first = t.points[0][3];
        const last = t.points.at(-1)[3];
        if (first < 0) bad.push(`${c.id}/${t.id}: starts ${-first} s before the case time`);
        // An aircraft may land a little after the episode it was part of ends; half an hour is generous.
        if (last > span + 30 * 60) bad.push(`${c.id}/${t.id}: runs ${Math.round((last - span) / 60)} min past the case end`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('gives crewed aircraft, vehicles, ships and balloons speeds they could have had', () => {
    // km/h between two consecutive points, altitude included. UAP, meteor and rocket paths are left alone.
    const CAP = { aircraft: 1400, vehicle: 200, ship: 100, balloon: 450 };
    // Gulfport to Winnsboro in ten minutes is about 2,000 km/h. The places and the times both come from one
    // account (McDonald, 1970) that has to be re-read before either is changed.
    const unchecked = new Set(['rb-47-1957/rb47']);
    const bad = [];
    for (const c of CASES) {
      for (const t of c.tracks || []) {
        const cap = CAP[t.kind];
        if (!cap || unchecked.has(`${c.id}/${t.id}`)) continue;
        for (let i = 1; i < t.points.length; i++) {
          const [lo1, la1, a1, t1] = t.points[i - 1];
          const [lo2, la2, a2, t2] = t.points[i];
          const km = Math.hypot(haversineKm(la1, lo1, la2, lo2), (a2 - a1) / 1000);
          const kmh = t2 > t1 ? (km / (t2 - t1)) * 3600 : km > 0.05 ? Infinity : 0;
          if (kmh > cap) bad.push(`${c.id}/${t.id} point ${i}: ${Math.round(kmh)} km/h for a ${t.kind}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it.each([
    // The paths are timed from these moments: the barrage opens 60 minutes after the radar contact, the helicopter
    // meets the red light 35 minutes after leaving Columbus.
    ['battle-of-los-angeles-1942', '02:15'],
    ['coyne-1973', '22:30'],
  ])('%s is dated at the clock time its track and timeline start from', (id, clock) => {
    const c = CASES.find((x) => x.id === id);
    expect(c.date.slice(11, 16)).toBe(clock);
    expect(c.timeline.some((e) => e.t === clock)).toBe(true);
    expect(Math.min(...c.tracks.flatMap((t) => t.points.map((p) => p[3])))).toBe(0);
  });

  it('cites only DVIDS files and Blue Book records that are in the data shipped with the app', () => {
    const dvids = new Set(json('official-uap-media.json').items.map((i) => String(i.dvidsId)));
    const blueBook = new Set(json('bluebook.json').records.map((r) => r[0]));
    const bad = [];
    for (const c of CASES) {
      for (const m of c.media || []) {
        if (m.dvids && !dvids.has(String(m.dvids))) bad.push(`${c.id}: DVIDS ${m.dvids}`);
        if (m.ia && !blueBook.has(m.ia)) bad.push(`${c.id}: ${m.ia}`);
        const pdf = m.commons && /^File:Project Blue Book report - (.+)\.pdf$/.exec(m.commons);
        if (pdf && !blueBook.has(pdf[1])) bad.push(`${c.id}: Blue Book PDF ${pdf[1]}`);
      }
      for (const id of c.bluebook || []) if (!blueBook.has(id)) bad.push(`${c.id}: bluebook ${id}`);
    }
    expect(bad).toEqual([]);
  });

  it('writes Wikipedia titles as plain titles, not addresses or underscored names', () => {
    const bad = CASES.filter((c) => c.wiki != null && (typeof c.wiki !== 'string' || /_|^\s|\s$|\s{2}|^https?:|%[0-9a-f]{2}/i.test(c.wiki))).map((c) => `${c.id}: ${c.wiki}`);
    expect(bad).toEqual([]);
  });
});

describe('numbers the docs quote about the cases', () => {
  const doc = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const spelled = (words) => {
    const parts = words.toLowerCase().split('-');
    return parts.reduce((sum, w) => sum + (UNITS.indexOf(w) >= 0 ? UNITS.indexOf(w) : TENS.indexOf(w) * 10), 0);
  };

  it('quote the number of cases in AGENTS.md and DATA_SOURCES.md', () => {
    expect(+/a CesiumJS 3D globe of (\d+) documented/.exec(doc('AGENTS.md'))[1]).toBe(CASES.length);
    expect(+/The (\d+) curated case files/.exec(doc('DATA_SOURCES.md'))[1]).toBe(CASES.length);
  });

  it('quote how many cases have a flight path and how many have an approximate time in docs/KNOWN-ISSUES.md', () => {
    const text = doc('docs/KNOWN-ISSUES.md');
    expect(spelled(/([A-Za-z-]+) cases draw one/.exec(text)[1])).toBe(CASES.filter((c) => c.tracks?.length).length);
    expect(spelled(/([A-Za-z-]+)(?: older)? cases record only a date or part of a day/.exec(text)[1])).toBe(CASES.filter((c) => c.timeApprox).length);
  });
});

describe('track heights are above sea level', () => {
  // The globe plots a height as metres above sea level, so a point on the ground at 0 is buried wherever the land is
  // higher. Each of these is the ground at that place, in metres (a public elevation model, to within about 20 m).
  it.each([
    ['tehran-1976', 'f4-1', 'Shahrokhi AB, Hamadan', 1650],
    ['tehran-1976', 'f4-2', 'Lands at Mehrabad', 1150],
    ['manises-1979', 'mirage', 'Scramble from Los Llanos AB', 680],
    ['brazil-ufo-night-1986', 'jg116', 'Scramble', 1100],
    ['belgian-wave-1990', 'f16', 'Scramble from Beauvechain', 90],
    ['mantell-1948', 'mantell', 'Crash site south of Franklin, KY', 200],
    ['coyne-1973', 'uh1h', 'Port Columbus', 230],
    ['kecksburg-1965', 'fireball', 'Claimed impact in the woods at Kecksburg', 330],
    ['dalnegorsk-1986', 'sphere', 'Strikes Izvestkovaya (Height 611)', 330],
    ['loring-1975', 'intruder', 'Seen near the north perimeter', 220 + 80], // the base is 227 m up; the object was about 90 m above it
    ['minot-afb-1968', 'object', 'Bright light seen near the ground', 538 + 100],
  ])('%s: "%s" is not under the ground', (id, track, note, minM) => {
    const t = CASES.find((c) => c.id === id).tracks.find((x) => x.id === track);
    const point = t.points.find((q) => q[4] === note);
    expect(point[2]).toBeGreaterThanOrEqual(minM);
  });
});

describe('details checked against the articles the cases cite', () => {
  const byId = (id) => CASES.find((c) => c.id === id);

  it('has the F-94 chase over Washington on the night of July 26, 1952, the second Saturday', () => {
    // Wikipedia, "1952 Washington, D.C., UFO incident": the jets from New Castle arrived at 11:30 p.m. on July 26.
    const t = byId('washington-dc-1952').timeline.map((e) => e.t);
    expect(t).toContain('Jul 26, ~23:25');
    expect(t).not.toContain('Jul 27, ~23:25');
  });

  it('dates the Ängelholm memorial to 1972, after Carlsson first told the story in 1971', () => {
    // Wikipedia ("Ängelholm UFO memorial", English and Swedish): interview in 1971, memorial built the next year.
    const c = byId('angelholm-1946');
    expect(c.summary).toContain('In 1972 he built');
    expect(c.summary).not.toContain('1963');
    const years = c.timeline.map((e) => e.t).filter((t) => /^\d{4}$/.test(t));
    expect(years).toEqual(['1971', '1972']);
  });
});

describe('shape classes and the evidence score', () => {
  it('reads "sphere" as a word start, so "atmospheric" is not a sphere', () => {
    expect(shapeClasses('Object with apparent atmospheric wake')).toEqual([]);
    expect(shapeClasses('A column rising into the stratosphere')).toEqual([]);
    expect(shapeClasses('Large glowing sphere')).toContain('sphere');
    expect(shapeClasses('Two spherical objects')).toContain('sphere');
    expect(shapeClasses('Silver orb')).toContain('sphere');
  });

  it('copes with a missing shape', () => {
    expect(shapeClasses()).toEqual([]);
    expect(shapeClasses(null)).toEqual([]);
    expect(shapeClasses('')).toEqual([]);
  });

  it('scores nothing as 0, ignores unknown kinds of evidence and never passes 10', () => {
    expect(evidenceScore()).toBe(0);
    expect(evidenceScore([], false)).toBe(0);
    expect(evidenceScore(['not-a-kind'], false)).toBe(0);
    expect(evidenceScore(Object.keys(EVIDENCE), true)).toBe(10);
  });
});
