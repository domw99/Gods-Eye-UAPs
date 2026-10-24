import { describe, it, expect } from 'vitest';
import * as Cesium from 'cesium';
import { tiltStep, spinsEarth, spinStep, SPIN_FROM_M } from '../src/app/flycam.js';

const LEVEL = -0.05; // the highest the view may rise: just below the horizon
const DOWN = -Math.PI / 2 + 0.01; // the lowest: just short of straight down

describe('tilting the view with Shift and the arrow keys', () => {
  it('passes a step through while the pitch stays between the limits', () => {
    expect(tiltStep(-0.8, 0.1)).toBeCloseTo(0.1, 12);
    expect(tiltStep(-0.8, -0.1)).toBeCloseTo(-0.1, 12);
  });

  it('never raises the view past the horizon', () => {
    for (const pitch of [-1, -0.5, -0.1, -0.06]) {
      let p = pitch;
      for (let i = 0; i < 100; i++) p += tiltStep(p, 0.1);
      expect(p).toBeCloseTo(LEVEL, 12);
    }
    expect(tiltStep(LEVEL, 0.1)).toBeCloseTo(0, 12);
  });

  it('never lowers the view past straight down, and can always come back from either end', () => {
    let p = -0.8;
    for (let i = 0; i < 100; i++) p += tiltStep(p, -0.1);
    expect(p).toBeCloseTo(DOWN, 12);
    expect(tiltStep(DOWN, -0.1)).toBeCloseTo(0, 12);
    expect(tiltStep(LEVEL, -0.1)).toBeCloseTo(-0.1, 12);
    expect(tiltStep(DOWN, 0.1)).toBeCloseTo(0.1, 12);
  });
});

describe('turning the Earth from far out (O)', () => {
  it('turns the Earth only when the camera is far enough out to see most of it', () => {
    expect(spinsEarth(SPIN_FROM_M)).toBe(true);
    expect(spinsEarth(20_000_000)).toBe(true);
    expect(spinsEarth(SPIN_FROM_M - 1)).toBe(false);
    expect(spinsEarth(40_000)).toBe(false);
    expect(spinsEarth(NaN)).toBe(false);
  });

  it('moves the ground east under the camera, as the Earth turns, one turn in 90 seconds', () => {
    // Camera#rotate on a bare camera: the rotation the globe's camera makes each frame.
    const position = Cesium.Cartesian3.fromDegrees(10, 20, 15_000_000);
    const camera = {
      position,
      direction: Cesium.Cartesian3.normalize(Cesium.Cartesian3.negate(position, new Cesium.Cartesian3()), new Cesium.Cartesian3()),
      up: new Cesium.Cartesian3(0, 0, 1),
      right: new Cesium.Cartesian3(),
      _adjustOrthographicFrustum() {},
    };
    Cesium.Camera.prototype.rotate.call(camera, Cesium.Cartesian3.UNIT_Z, spinStep(1));
    const after = Cesium.Cartographic.fromCartesian(camera.position);
    // The camera goes west by 4° in a second, so what is below it moves east.
    expect(Cesium.Math.toDegrees(after.longitude)).toBeCloseTo(6, 6);
    expect(Cesium.Math.toDegrees(after.latitude)).toBeCloseTo(20, 6);
    expect(after.height).toBeCloseTo(15_000_000, 0);
    expect(spinStep(90)).toBeCloseTo(2 * Math.PI, 12);
    expect(spinStep(-1)).toBe(0);
    expect(spinStep(undefined)).toBe(0);
  });
});
