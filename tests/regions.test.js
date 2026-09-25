import { describe, it, expect } from 'vitest';
import { resolveRegion } from '../src/data/regions.js';

describe('official release region resolver', () => {
  it('prefers the title', () => {
    expect(resolveRegion('DOW-UAP-PR117, Unresolved UAP Report, Gulf of Oman, 2021', 'aboard a U.S. military platform').name).toBe('Gulf of Oman');
  });
  it('reads "operating within … Central Command" phrases', () => {
    const r = resolveRegion('DOW-UAP-PR076, "03 January 2021 [CALLSIGN] (Mission) observes UAP"', 'likely derived from an infrared sensor aboard a U.S. military platform operating within the United States Central Command area of responsibility in January 2021.');
    expect(r.name).toMatch(/CENTCOM/);
  });
  it('does not treat "U.S. military platform" as a location', () => {
    expect(resolveRegion('DOW-UAP-PR056, "Spherical UAP pulsing over water"', 'from an infrared sensor aboard a U.S. military platform.')).toBeNull();
  });
  it('matches named sites before broad regions', () => {
    expect(resolveRegion('USCG C-144 Tyndall UAP 2 TIC TAC IR hot').precision).toBe('area');
    expect(resolveRegion('Kazakhstan - UAP in the vicinity of Karaganda International Airport').precision).toBe('site');
  });
  it('knows the Gulf of America rename', () => {
    expect(resolveRegion('Unresolved UAP Report, Gulf of America, 2019').name).toMatch(/Gulf of Mexico/);
  });
});
