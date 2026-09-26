import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { words, shardOf, encodePostings, decodePostings, intersect, pageLocator } from '../src/services/textsearch.js';

describe('journal text search', () => {
  it('splits text into index words the same way for build and search', () => {
    expect(words('The Delphos ring glowed; Durel Johnson’s dog saw it. UFO UFOs aaaa bcdf')).toEqual(new Set(['delphos', 'ring', 'glowed', 'durel', 'johnson']));
    expect(words('Évry à Valensole')).toEqual(new Set(['évry', 'valensole']));
    expect(shardOf('évry')).toBe('e');
    expect(shardOf('zamora')).toBe('z');
  });

  it('round-trips postings and intersects lists', () => {
    const ids = [3, 10, 11, 400, 12345];
    expect(decodePostings(encodePostings(ids))).toEqual(ids);
    expect(intersect([[1, 3, 5, 9], [3, 4, 9], [3, 9]])).toEqual([3, 9]);
    expect(intersect([])).toEqual([]);
  });

  it('locates a page id in its archive, issue and leaf', () => {
    const locate = pageLocator({ archives: [{ key: 'mufon', issuePages: [3, 2] }, { key: 'journals', issuePages: [4] }] });
    expect(locate(0)).toEqual({ archive: 'mufon', issue: 0, leaf: 0 });
    expect(locate(4)).toEqual({ archive: 'mufon', issue: 1, leaf: 1 });
    expect(locate(5)).toEqual({ archive: 'journals', issue: 0, leaf: 0 });
    expect(locate(8)).toEqual({ archive: 'journals', issue: 0, leaf: 3 });
  });
});

const META = new URL('../public/data/textindex/meta.json', import.meta.url);
describe.runIf(existsSync(META))('journal text index', () => {
  it('counts the same pages as the MUFON and archive datasets', () => {
    const meta = JSON.parse(readFileSync(META, 'utf8'));
    const mufon = JSON.parse(readFileSync(new URL('../public/data/mufon.json', import.meta.url), 'utf8'));
    const journals = JSON.parse(readFileSync(new URL('../public/data/journals.json', import.meta.url), 'utf8'));
    expect(meta.archives[0].issuePages).toEqual(mufon.issues.map((is) => is[6]));
    expect(meta.archives[1].issuePages).toEqual(journals.issues.map((is) => is[11]));
    expect(meta.pages).toBe([...meta.archives[0].issuePages, ...meta.archives[1].issuePages].reduce((a, b) => a + b, 0));
  });

  it('finds a known case name and keeps page ids in range', () => {
    const meta = JSON.parse(readFileSync(META, 'utf8'));
    const z = JSON.parse(readFileSync(new URL('../public/data/textindex/z.json', import.meta.url), 'utf8'));
    const pages = decodePostings(z.zamora);
    expect(pages.length).toBeGreaterThan(20);
    expect(Math.max(...pages)).toBeLessThan(meta.pages);
    expect(meta.shards).toContain('z');
  });
});
