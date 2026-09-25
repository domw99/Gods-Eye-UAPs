/**
 * Authoring helpers for case files.
 *
 * Track points are stored as [lon, lat, altitudeMeters, secondsFromStart, note?].
 * `p()` lets case files be written in the order analysts quote positions:
 * latitude, longitude, altitude in FEET, seconds.
 */
export const FT = 0.3048;
export const MIN = 60;
export const HR = 3600;
export const DAY = 86400;

export const p = (lat, lon, altFt, t, note) =>
  note === undefined ? [lon, lat, Math.round(altFt * FT), t] : [lon, lat, Math.round(altFt * FT), t, note];

/** Commons file shorthand. */
export const commons = (file, caption) => ({ commons: file.startsWith('File:') ? file : `File:${file}`, caption });
/** Official DVIDS video/image shorthand (ID from the DVIDS URL). */
export const dvids = (id, caption) => ({ dvids: String(id), caption });
/** Internet Archive document (e.g. a Project Blue Book case file). */
export const ia = (identifier, caption) => ({ ia: identifier, caption });
/** Link-only reference. */
export const link = (label, url, kind = 'reference') => ({ label, url, kind });
