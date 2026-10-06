import { describe, it, expect } from 'vitest';
import { parseCoordinates, formatCoordinates } from '../src/app/coords.js';

const near = (text, lat, lon) => {
  const r = parseCoordinates(text);
  expect(r, text).not.toBeNull();
  expect(r.lat, text).toBeCloseTo(lat, 4);
  expect(r.lon, text).toBeCloseTo(lon, 4);
};

describe('reading coordinates from text', () => {
  it('reads decimal degrees, with a comma, a space or a semicolon', () => {
    near('51.5, -0.12', 51.5, -0.12);
    near('51.5,-0.12', 51.5, -0.12);
    near('51.5 -0.12', 51.5, -0.12);
    near('51.5; -0.12', 51.5, -0.12);
    near('-33.8688, 151.2093', -33.8688, 151.2093);
    near('33.3943, -104.5230', 33.3943, -104.523);
    near('48.8566°, 2.3522°', 48.8566, 2.3522);
    near('−33.87, 151.21', -33.87, 151.21); // a typographic minus sign
  });

  it('reads hemispheres before or after the numbers, in either order', () => {
    near('51.5N 0.12W', 51.5, -0.12);
    near('51.5° N, 0.12° W', 51.5, -0.12);
    near('N 51.5 W 0.12', 51.5, -0.12);
    near('N51.5, W0.12', 51.5, -0.12);
    near('0.12W 51.5N', 51.5, -0.12);
    near('33.9S 18.4E', -33.9, 18.4);
    near('34.05 north, 118.25 west', 34.05, -118.25);
  });

  it('reads degrees, minutes and seconds, and degrees and decimal minutes', () => {
    near('51°30\'26"N 0°7\'39"W', 51 + 30 / 60 + 26 / 3600, -(7 / 60 + 39 / 3600));
    near('51 30 26 N 0 7 39 W', 51 + 30 / 60 + 26 / 3600, -(7 / 60 + 39 / 3600));
    near('N 33°23\'39" W 104°31\'23"', 33 + 23 / 60 + 39 / 3600, -(104 + 31 / 60 + 23 / 3600));
    near('40°26.767′N 79°58.933′W', 40 + 26.767 / 60, -(79 + 58.933 / 60));
    near('35 degrees 10 minutes north 106 degrees 30 minutes west', 35 + 10 / 60, -(106 + 30 / 60));
  });

  it('reads the links maps and phones share', () => {
    near('geo:51.5,-0.12', 51.5, -0.12);
    near('geo:37.786971,-122.399677?z=11', 37.786971, -122.399677);
    near('https://www.google.com/maps/@51.5072,-0.1276,15z', 51.5072, -0.1276);
    near('https://www.google.com/maps/place/Roswell/data=!3d33.3943!4d-104.523', 33.3943, -104.523);
    near('https://www.openstreetmap.org/#map=12/48.8566/2.3522', 48.8566, 2.3522);
    near('https://www.openstreetmap.org/?mlat=51.5&mlon=-0.12#map=12/51.5/-0.12', 51.5, -0.12);
    near('https://maps.apple.com/?ll=40.7128,-74.0060&z=10', 40.7128, -74.006);
    near('https://www.google.com/maps?q=35.0,-106.6', 35, -106.6);
  });

  it('puts longitude first only when that is the only way to read it', () => {
    near('-122.4194, 37.7749', 37.7749, -122.4194);
    near('151.2093, -33.8688', -33.8688, 151.2093);
    near('45.5, 120.5', 45.5, 120.5); // either reads, so latitude first
  });

  it('turns down what is not a coordinate pair', () => {
    for (const text of ['', 'Roswell', 'Roswell 1947', '1952', '1952 7', '12 34', '91.5, 100', '10, 181', '51.5N 0.12N', '51.5N', '1.5, 2.5, 3.5', 'abc 51.5, -0.12', '51°70\'N 0°7\'W', 'N 51.5 W 0.12 extra', '51.5E 10.1W', null, undefined])
      expect(parseCoordinates(text), String(text)).toBeNull();
  });

  it('does not read a long text', () => {
    expect(parseCoordinates(`51.5,${' '.repeat(300)}-0.12`)).toBeNull();
  });
});

describe('writing coordinates', () => {
  it('writes degrees with the hemisphere', () => {
    expect(formatCoordinates(51.5, -0.12)).toBe('51.5000° N, 0.1200° W');
    expect(formatCoordinates(-33.8688, 151.2093, 2)).toBe('33.87° S, 151.21° E');
  });
});
