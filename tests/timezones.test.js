import { describe, it, expect } from 'vitest';
import { CASES } from '../src/data/cases/index.js';

/**
 * Every case stores its time with the clock offset in force at that place and
 * day, and the sky, the lighting and the UTC time all follow from it. This
 * checks the offsets against the real time-zone rules (the browser's tz
 * database) for countries whose zones are few and well documented. It starts
 * in 1970: before that, daylight saving varied town by town, which one zone
 * name cannot say; a few older cases are pinned by hand below.
 */
const ZONES = {
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Honolulu', 'America/Puerto_Rico', 'America/Indiana/Indianapolis', 'America/Detroit', 'America/Boise', 'America/Juneau', 'America/Adak', 'Pacific/Guam'],
  CA: ['America/St_Johns', 'America/Halifax', 'America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver', 'America/Regina', 'America/Whitehorse', 'America/Moncton'],
  GB: ['Europe/London'], GG: ['Europe/London'], IE: ['Europe/Dublin'], FR: ['Europe/Paris'], DE: ['Europe/Berlin'], IT: ['Europe/Rome'], BE: ['Europe/Brussels'], NL: ['Europe/Amsterdam'],
  NO: ['Europe/Oslo'], SE: ['Europe/Stockholm'], PL: ['Europe/Warsaw'], CH: ['Europe/Zurich'], ES: ['Europe/Madrid', 'Atlantic/Canary'],
  RU: ['Europe/Moscow', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Europe/Samara', 'Asia/Novosibirsk', 'Asia/Vladivostok'],
  MX: ['America/Mexico_City', 'America/Chihuahua', 'America/Tijuana', 'America/Monterrey', 'America/Hermosillo', 'America/Mazatlan', 'America/Merida', 'America/Cancun', 'America/Matamoros', 'America/Ojinaga'],
  BR: ['America/Sao_Paulo', 'America/Belem', 'America/Manaus', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Noronha', 'America/Cuiaba', 'America/Campo_Grande'],
  AR: ['America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba', 'America/Argentina/Mendoza'], CL: ['America/Santiago'], PE: ['America/Lima'], CR: ['America/Costa_Rica'],
  AU: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin', 'Australia/Hobart'], NZ: ['Pacific/Auckland'], PG: ['Pacific/Port_Moresby'],
  JP: ['Asia/Tokyo'], CN: ['Asia/Shanghai'], IN: ['Asia/Kolkata'], IR: ['Asia/Tehran'], ZA: ['Africa/Johannesburg'], ZW: ['Africa/Harare'], KP: ['Asia/Pyongyang', 'Asia/Seoul'], PR: ['America/Puerto_Rico'],
};

const minutes = (iso) => {
  const m = iso.match(/([+-])(\d\d):(\d\d)$/);
  return (m[1] === '+' ? 1 : -1) * (+m[2] * 60 + +m[3]);
};
const offsetOf = (zone, date) => {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(date).find((p) => p.type === 'timeZoneName').value;
  const m = part.match(/GMT([+-])(\d\d):(\d\d)/);
  return m ? (m[1] === '+' ? 1 : -1) * (+m[2] * 60 + +m[3]) : 0;
};

describe('case time offsets', () => {
  it('match the time-zone rules of the place and day, from 1970', () => {
    const wrong = [];
    for (const c of CASES) {
      if (new Date(c.date).getUTCFullYear() < 1970 || !ZONES[c.cc]) continue;
      const off = minutes(c.date);
      const ok = ZONES[c.cc].some((z) => offsetOf(z, new Date(c.date)) === off);
      if (!ok) wrong.push(`${c.id} ${c.date}`);
    }
    expect(wrong).toEqual([]);
  });

  it.each([
    ['battle-of-los-angeles-1942', -420], // U.S. "War Time" had put clocks an hour forward from February 9, 1942
    ['roswell-1947', -420], // no daylight saving in New Mexico in 1947
    ['valensole-1965', 60], // France kept winter time all year until 1976
    ['buenos-aires-meteors-1965', -240], // Argentina was at UTC−4 until 1969
  ])('%s is at the right offset', (id, expected) => {
    expect(minutes(CASES.find((c) => c.id === id).date)).toBe(expected);
  });
});
