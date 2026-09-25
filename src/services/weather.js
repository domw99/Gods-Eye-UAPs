/**
 * Weather at the time of a sighting, from Open-Meteo (no key): the ERA5
 * reanalysis archive back to 1940, or the forecast API for the last few days.
 * Wind matters most: balloons and lanterns drift with it, and several
 * official explanations (Aguadilla, many 1940s–50s cases) rest on it.
 */
import { bearingDeg, angleDiff, trackLengthKm } from '../util/geo.js';

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const VARS = [
  'temperature_2m',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'wind_speed_100m',
  'wind_direction_100m',
];
const DAY = 86400e3;

// WMO weather interpretation codes (Open-Meteo).
const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers',
  82: 'Violent rain showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};
export const describeWeatherCode = (code) => WMO[code] ?? '—';

/** Direction the wind blows toward (winds are reported by where they come from). */
export const driftToward = (fromDeg) => (fromDeg + 180) % 360;

export function nearestHourIndex(times, when) {
  const t = new Date(when).getTime();
  let best = -1;
  let bestGap = Infinity;
  times.forEach((iso, i) => {
    const gap = Math.abs(Date.parse(`${iso}Z`) - t);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  });
  return bestGap <= 90 * 60e3 ? best : -1;
}

export function pickHour(json, when) {
  const h = json?.hourly;
  if (!h?.time?.length) return null;
  const i = nearestHourIndex(h.time, when);
  if (i < 0) return null;
  const out = { hour: `${h.time[i]}Z`, elevation: json.elevation };
  for (const v of VARS) out[v] = h[v]?.[i] ?? null;
  return out;
}

export const weatherAvailable = (when) => new Date(when).getUTCFullYear() >= 1940 && new Date(when).getTime() < Date.now() + 10 * DAY;

/** Fetch the hour nearest `when` at a place. Resolves to null when no data exists. */
export async function weatherAt(lat, lon, when) {
  if (!weatherAvailable(when)) return null;
  const t = new Date(when);
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)},${t.toISOString().slice(0, 13)}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null');
    if (hit) return hit;
  } catch {
    /* ignore */
  }
  const recent = Date.now() - t.getTime() < 6 * DAY;
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: VARS.join(','),
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  });
  let url;
  if (recent) {
    params.set('past_days', '7');
    params.set('forecast_days', '10');
    url = `${FORECAST}?${params}`;
  } else {
    params.set('start_date', day(t.getTime() - DAY));
    params.set('end_date', day(t.getTime() + DAY));
    url = `${ARCHIVE}?${params}`;
  }
  let res;
  try {
    res = await fetch(url);
  } catch {
    // Busy moments return errors without CORS headers; one retry usually works.
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const wx = pickHour(await res.json(), when);
  if (wx) {
    wx.source = recent ? 'Open-Meteo forecast model' : 'ERA5 reanalysis via Open-Meteo';
    if (!recent)
      try {
        localStorage.setItem(key, JSON.stringify(wx));
      } catch {
        /* storage full: fine */
      }
  }
  return wx;
}

/**
 * Does a slow UAP track run with the wind? Returns null when the comparison
 * isn't meaningful (fast objects, no wind, tiny tracks).
 */
export function trackVsWind(track, wx) {
  if (!track || !wx) return null;
  const pts = track.points;
  if (pts.length < 2) return null;
  const [lon1, lat1] = pts[0];
  const [lon2, lat2] = pts[pts.length - 1];
  const km = trackLengthKm(pts);
  const secs = pts[pts.length - 1][3] - pts[0][3];
  if (km < 1 || secs <= 0) return null;
  const speed = (km / secs) * 3600;
  const heading = bearingDeg(lat1, lon1, lat2, lon2);
  const windSpeed = wx.wind_speed_100m ?? wx.wind_speed_10m;
  const windFrom = wx.wind_direction_100m ?? wx.wind_direction_10m;
  if (windSpeed == null || windFrom == null || windSpeed < 5) return null;
  if (speed > 250) return { heading, speed, windToward: driftToward(windFrom), windSpeed, verdict: 'fast' };
  const diff = angleDiff(heading, driftToward(windFrom));
  const ratio = speed / windSpeed;
  const verdict = diff <= 35 && ratio > 0.4 && ratio < 2.5 ? 'with-wind' : diff >= 120 ? 'against-wind' : 'across-wind';
  return { heading, speed, windToward: driftToward(windFrom), windSpeed, diff, verdict };
}
