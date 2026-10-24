import historical from './historical.js';
import northAmerica from './north-america.js';
import northAmericaMore from './north-america-more.js';
import world from './world.js';
import worldMore from './world-more.js';
import moreCases from './more-cases.js';
import abroadCases from './abroad-cases.js';
import moreEncounters from './more-encounters.js';
import filesAndResolutions from './files-and-resolutions.js';
import unitedStatesMore from './united-states-more.js';

export const CASES = [...historical, ...northAmerica, ...northAmericaMore, ...world, ...worldMore, ...moreCases, ...abroadCases, ...moreEncounters, ...filesAndResolutions, ...unitedStatesMore].sort(
import europeMore from './europe-more.js';
export const CASES = [...historical, ...northAmerica, ...northAmericaMore, ...world, ...worldMore, ...moreCases, ...abroadCases, ...moreEncounters, ...filesAndResolutions, ...europeMore].sort(
  (a, b) => Date.parse(a.date) - Date.parse(b.date),
);
