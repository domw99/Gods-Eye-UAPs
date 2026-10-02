import * as A from 'astronomy-engine';

/**
 * Where the Sun is, seen from the Moon, in the Moon's own frame (the one its
 * maps use: x towards 0° E on the equator, y towards 90° E, z north). The IAU
 * rotation model gives the pole and the prime meridian at a moment; the Sun's
 * position comes from the Earth's centre minus the Moon's.
 */
const RAD = Math.PI / 180;

/** Turn a vector by `deg` about the z axis, as a change of frame. */
const rz = (deg, [x, y, z]) => {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [c * x + s * y, -s * x + c * y, z];
};
const rx = (deg, [x, y, z]) => {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [x, c * y + s * z, -s * y + c * z];
};

/**
 * @param {Date} date
 * @returns {{ x: number, y: number, z: number, lat: number, lon: number }} a unit vector
 *   from the Moon's centre towards the Sun, and the point on the Moon where the Sun is overhead
 */
export function sunOnMoon(date) {
  const time = A.MakeTime(date);
  const sun = A.GeoVector(A.Body.Sun, time, false);
  const moon = A.GeoMoon(time);
  const axis = A.RotationAxis(A.Body.Moon, time);
  // J2000 equator → the Moon's frame: R = Rz(W) · Rx(90° − δ) · Rz(90° + α)
  let v = [sun.x - moon.x, sun.y - moon.y, sun.z - moon.z];
  v = rz(90 + axis.ra * 15, v);
  v = rx(90 - axis.dec, v);
  v = rz(axis.spin, v);
  const n = Math.hypot(...v);
  const [x, y, z] = v.map((c) => c / n);
  return { x, y, z, lat: Math.asin(z) / RAD, lon: Math.atan2(y, x) / RAD };
}
