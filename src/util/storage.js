/**
 * Browser storage for things that can be fetched again (weather hours, launch
 * lists). When the quota is full, drop those caches and try once more, so a
 * long session of looking at cases never takes the room that the user's own
 * sighting log and stars need.
 */
const DROPPABLE = /^(wx|ll2):/;

export function dropCaches(keep = null) {
  try {
    for (const key of Object.keys(localStorage)) if (DROPPABLE.test(key) && key !== keep) localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing to drop */
  }
}

/** Store a cache entry; true when it was stored. */
export function setCached(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    dropCaches(key);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
