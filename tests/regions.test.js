import { describe, it, expect } from 'vitest';
import { resolveRegion, REGIONS } from '../src/data/regions.js';

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
  it('reads "Indo-Pacific" as the command area, not as the Pacific Ocean', () => {
    expect(resolveRegion('DOW-UAP-PR200, Unresolved UAP Report, Indo-Pacific, 2025').name).toMatch(/INDOPACOM/);
    expect(resolveRegion('UAP report', 'from a sensor aboard a U.S. military platform operating in the Indo-Pacific region in 2023.').name).toMatch(/INDOPACOM/);
    expect(resolveRegion('Unresolved UAP Report, INDOPACOM, 2024').name).toMatch(/INDOPACOM/);
    // A named sea in the same title is still the more specific place; the ocean alone is still the ocean.
    expect(resolveRegion('Unresolved UAP Report, Yellow Sea, Indo-Pacific, 2023').name).toBe('Yellow Sea');
    expect(resolveRegion('DOW-UAP-PR123, Unresolved UAP Report, Pacific Ocean, 2019').name).toBe('Pacific Ocean');
  });
  it('keeps West Virginia and Virginia apart, and New Mexico apart from Mexico', () => {
    expect(resolveRegion('Unresolved UAP Report, West Virginia, 2022').name).toBe('West Virginia');
    expect(resolveRegion('Unresolved UAP Report, Virginia, 2022').name).toBe('Virginia');
    expect(resolveRegion('Unresolved UAP Report, New Mexico, 2022').name).toBe('New Mexico');
    expect(resolveRegion('Unresolved UAP Report, Mexico, 2022').name).toBe('Mexico');
  });
  it('gives every region a real centre, a positive radius and a known precision', () => {
    for (const r of REGIONS) {
      expect(Math.abs(r.lat), r.name).toBeLessThanOrEqual(90);
      expect(Math.abs(r.lon), r.name).toBeLessThanOrEqual(180);
      expect(r.radiusKm, r.name).toBeGreaterThan(0);
      expect(['site', 'city', 'area', 'region'], r.name).toContain(r.precision);
    }
  });
});
