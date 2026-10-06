import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseNearHash } from '../src/app/links.js';
import { isLogEntry } from '../src/data/items.js';

describe('#/near/ addresses', () => {
  it('reads a place, with or without a label', () => {
    expect(parseNearHash('#/near/51.5,-0.12/London%2C%20UK')).toMatchObject({ lat: 51.5, lon: -0.12, label: 'London, UK', ok: true });
    expect(parseNearHash('#/near/-33.87,151.21')).toMatchObject({ lat: -33.87, lon: 151.21, label: '-33.87, 151.21', ok: true });
  });

  it('keeps a stray % in the label from throwing', () => {
    expect(parseNearHash('#/near/1,2/50%')).toMatchObject({ label: '50%', ok: true });
  });

  it('is not the route for any other address', () => {
    for (const hash of ['', '#', '#/case/x', '#/near/', '#/near/1,2/', '#/near/a,b', '#/nearby/1,2']) expect(parseNearHash(hash), hash).toBeNull();
  });

  it('refuses numbers that are not a place on Earth, which would send the camera to NaN', () => {
    for (const hash of ['#/near/1.2.3,4.5.6', '#/near/.,.', '#/near/91,0', '#/near/0,181', '#/near/-90.5,0', '#/near/999,999'])
      expect(parseNearHash(hash)?.ok, hash).toBe(false);
    expect(parseNearHash('#/near/90,180')?.ok).toBe(true);
    expect(parseNearHash('#/near/-90,-180')?.ok).toBe(true);
  });
});

describe('the saved sighting log', () => {
  const good = { id: 'a1', date: '2024-05-01T20:15:00.000Z', lat: 40.1, lon: -105.3, title: 'Lights' };

  it('keeps entries the app wrote', () => {
    expect(isLogEntry(good)).toBe(true);
    expect(isLogEntry({ ...good, lat: 0, lon: 0 })).toBe(true);
  });

  it('leaves out entries that would put NaN on the years bar or stop the app starting', () => {
    const { date, ...noDate } = good;
    const { id, ...noId } = good;
    for (const bad of [null, 5, 'x', [], {}, noDate, noId, { ...good, date: 'garbage' }, { ...good, date: 1714594500000 }, { ...good, lat: '40' }, { ...good, lat: 91 }, { ...good, lon: NaN }, { ...good, lon: 200 }])
      expect(isLogEntry(bad), JSON.stringify(bad)).toBe(false);
  });
});

describe('the elements the code looks up', () => {
  const read = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!/i18n|data$/.test(path)) read(path, out);
      } else if (path.endsWith('.js')) out.push([path, readFileSync(path, 'utf8')]);
    }
    return out;
  };
  const sources = read('src');
  const page = readFileSync('index.html', 'utf8');
  // Panels and dialogs built in code carry their own ids; the rest must be in index.html.
  const built = new Set(sources.flatMap(([, text]) => [...text.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1])));
  const looked = sources.flatMap(([file, text]) => [...text.matchAll(/getElementById\('([\w-]+)'\)|querySelector(?:All)?\('#([\w-]+)/g)].map((m) => [file, m[1] || m[2]]));

  it('finds them all', () => expect(looked.length).toBeGreaterThan(80));

  it('has every id in index.html or in markup that the code builds', () => {
    const missing = looked.filter(([, id]) => !page.includes(`id="${id}"`) && !built.has(id)).map(([file, id]) => `${file}: #${id}`);
    expect(missing).toEqual([]);
  });
});
