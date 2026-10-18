import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveRegionToken } from '../scripts/lib/geonames.mjs';

const gz = { countries: new Map() };

describe('Blue Book places named with a Carolina', () => {
  it('reads "N-Carolina", "S-Carolina" and "East of South Carolina" as the states, not the town in Puerto Rico', () => {
    for (const [token, key] of [['SCarolina', 'US.SC'], ['NCarolina', 'US.NC'], ['EOfNCarolina', 'US.NC'], ['EOfSouthCarolina', 'US.SC'], ['NorthCarolina', 'US.NC']])
      expect(resolveRegionToken(gz, token)?.key).toBe(key);
    expect(resolveRegionToken(gz, 'Carolina')).toBeNull(); // on its own it is a town, not a state
  });

  it('has no file named for a state of the U.S. placed in Puerto Rico', () => {
    const { records } = JSON.parse(readFileSync('public/data/bluebook.json', 'utf8'));
    const wrong = records.filter(([id, lat, lon]) => /(N|S|North|South)-?Carolina/i.test(id) && !/PuertoRico/i.test(id) && lat < 20 && lon > -70);
    expect(wrong.map((r) => r[0])).toEqual([]);
  });
});
