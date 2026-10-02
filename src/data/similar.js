import { shapeClasses } from './taxonomy.js';
import { haversineKm } from '../util/geo.js';

/**
 * How alike two case files are, for the "similar cases" list in a case file:
 * the same kind of encounter, the same kinds of evidence, a similar shape, the
 * same country, the same decade and the same place count for most. It is a
 * guide to where to read next, not a claim that the cases are connected.
 */
export function similarity(a, b) {
  let score = 0;
  if (a.category === b.category) score += 2;
  const shared = (a.evidence || []).filter((e) => (b.evidence || []).includes(e)).length;
  score += Math.min(3, shared);
  const shapesA = shapeClasses(a.shape);
  score += Math.min(2, shapesA.filter((s) => shapeClasses(b.shape).includes(s)).length);
  if (a.cc && a.cc === b.cc) score += 1;
  if (a.status === b.status) score += 0.5;
  const years = Math.abs(new Date(a.date).getUTCFullYear() - new Date(b.date).getUTCFullYear());
  if (years <= 5) score += 1;
  else if (years <= 15) score += 0.5;
  if (haversineKm(a.lat, a.lon, b.lat, b.lon) < 500) score += 1;
  return score;
}

/** The `n` cases most like `c`, best first, leaving out `c` itself and any that are only faintly alike. */
export function similarCases(c, all, n = 4, minScore = 5) {
  return all
    .filter((d) => d.id !== c.id)
    .map((d) => ({ d, score: similarity(c, d) }))
    .filter((x) => x.score >= minScore)
    .sort((x, y) => y.score - x.score || Math.abs(new Date(x.d.date) - new Date(c.date)) - Math.abs(new Date(y.d.date) - new Date(c.date)) || x.d.id.localeCompare(y.d.id))
    .slice(0, n)
    .map((x) => x.d);
}
