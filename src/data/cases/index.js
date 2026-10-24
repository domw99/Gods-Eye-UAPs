import historical from './historical.js';
import northAmerica from './north-america.js';
import northAmericaMore from './north-america-more.js';
import world from './world.js';
import worldMore from './world-more.js';
import moreCases from './more-cases.js';
import abroadCases from './abroad-cases.js';
import moreEncounters from './more-encounters.js';
import filesAndResolutions from './files-and-resolutions.js';
import latinAmericaMore from './latin-america-more.js';

export const CASES = [...historical, ...northAmerica, ...northAmericaMore, ...world, ...worldMore, ...moreCases, ...abroadCases, ...moreEncounters, ...filesAndResolutions, ...latinAmericaMore].sort(
  (a, b) => Date.parse(a.date) - Date.parse(b.date),
);
