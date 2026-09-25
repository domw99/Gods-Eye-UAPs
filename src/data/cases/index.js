import northAmerica from './north-america.js';
import world from './world.js';

/** All curated case files, oldest first. */
export const CASES = [...northAmerica, ...world].sort(
  (a, b) => Date.parse(a.date) - Date.parse(b.date),
);
