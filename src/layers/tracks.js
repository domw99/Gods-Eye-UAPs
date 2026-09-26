import * as Cesium from 'cesium';
import { horizonOf } from '../app/horizon.js';
import { TRACK_KINDS } from '../data/taxonomy.js';
import { densifyTrack, trackLengthKm } from '../util/geo.js';
import { declutter, onCameraSettle } from './declutter.js';

/**
 * Flight-path renderer and playback for one case at a time.
 *
 * Each track becomes: a glowing 3D polyline at altitude, a dashed ground
 * track, vertical drop lines and labelled waypoints, plus a moving contact
 * driven by the Cesium clock with a fading trail.
 */
export function trackStats(track) {
  const pts = track.points;
  const length = trackLengthKm(pts);
  const t0 = pts[0][3];
  const t1 = pts[pts.length - 1][3];
  const duration = t1 - t0;
  const maxAlt = Math.max(...pts.map((p) => p[2]));
  return {
    length,
    duration,
    maxAlt,
    avgSpeedKmh: duration > 0 ? (length / duration) * 3600 : null,
  };
}

function dotImage(color, size = 18) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size, size, 0, size, size, size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(size, size, size, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** A vertical fade for the curtain under a flight path: strong at the path, clear at the ground. */
const curtains = new Map();
function curtainImage(css, strength) {
  const key = `${css}|${strength}`;
  if (curtains.has(key)) return curtains.get(key);
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  const col = Cesium.Color.fromCssColorString(css);
  const rgba = (a) => `rgba(${Math.round(col.red * 255)},${Math.round(col.green * 255)},${Math.round(col.blue * 255)},${a})`;
  grad.addColorStop(0, rgba(strength));
  grad.addColorStop(0.08, rgba(strength * 0.55));
  grad.addColorStop(1, rgba(0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  curtains.set(key, c);
  return c;
}

export function createTrackLayer(viewer) {
  const horizon = horizonOf(viewer);
  const source = new Cesium.CustomDataSource('uap-tracks');
  viewer.dataSources.add(source);
  let current = null; // { caseData, start, stop, movers: [], primary }
  const tickListeners = new Set();
  let waypointLabels = []; // declutter candidates for the loaded case
  const tidyLabels = () => waypointLabels.length && declutter(viewer.scene, waypointLabels);
  onCameraSettle(viewer, tidyLabels);

  viewer.clock.onTick.addEventListener((clock) => {
    if (!current) return;
    for (const fn of tickListeners) fn(clock);
  });

  function clear() {
    witnessView(false);
    source.entities.removeAll();
    waypointLabels = [];
    if (viewer.trackedEntity) viewer.trackedEntity = undefined;
    viewer.clock.shouldAnimate = false;
    current = null;
    viewer.scene.requestRender();
  }

  function load(caseData) {
    clear();
    const tracks = caseData.tracks || [];
    if (!tracks.length) return null;
    const base = Cesium.JulianDate.fromDate(new Date(caseData.date));
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const t of tracks)
      for (const p of t.points) {
        tMin = Math.min(tMin, p[3]);
        tMax = Math.max(tMax, p[3]);
      }
    if (tMax <= tMin) tMax = tMin + 60;
    const start = Cesium.JulianDate.addSeconds(base, tMin, new Cesium.JulianDate());
    const stop = Cesium.JulianDate.addSeconds(base, tMax, new Cesium.JulianDate());
    const allPositions = [];
    const movers = [];

    for (const [trackIndex, track] of tracks.entries()) {
      const kind = TRACK_KINDS[track.kind] || TRACK_KINDS.uap;
      const color = Cesium.Color.fromCssColorString(track.color || kind.color);
      const dense = densifyTrack(track.points, 20);
      const positions = dense.map((p) => Cesium.Cartesian3.fromDegrees(p[0], p[1], p[2]));
      allPositions.push(...positions);

      source.entities.add({
        polyline: {
          positions,
          width: track.kind === 'uap' ? 5 : 3.5,
          arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.22,
            taperPower: 1,
            color: color.withAlpha(0.95),
          }),
        },
      });
      // A translucent curtain from the path down to the ground shows its height at a glance.
      if (Math.max(...track.points.map((p) => p[2])) > 150)
        source.entities.add({
          wall: {
            positions,
            material: new Cesium.ImageMaterialProperty({
              image: curtainImage(track.color || kind.color, track.kind === 'uap' ? 0.34 : 0.2),
              transparent: true,
            }),
          },
        });
      source.entities.add({
        polyline: {
          positions: dense.map((p) => Cesium.Cartesian3.fromDegrees(p[0], p[1], 0)),
          width: 1.5,
          clampToGround: true,
          material: new Cesium.PolylineDashMaterialProperty({ color: color.withAlpha(0.55), dashLength: 12 }),
        },
      });
      track.points.forEach((p, i) => {
        const top = Cesium.Cartesian3.fromDegrees(p[0], p[1], p[2]);
        if (p[2] > 30)
          source.entities.add({
            polyline: {
              positions: [Cesium.Cartesian3.fromDegrees(p[0], p[1], 0), top],
              width: 1,
              arcType: Cesium.ArcType.NONE,
              material: color.withAlpha(0.35),
            },
          });
        const wp = source.entities.add({
          position: top,
          point: {
            pixelSize: i === 0 ? 8 : 6,
            color: color,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
            outlineWidth: 1,
            disableDepthTestDistance: horizon.property,
          },
          label: p[4]
            ? {
                text: p[4],
                font: '500 11px Inter, sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                // Stagger labels per track so shared waypoints stay readable.
                pixelOffset: new Cesium.Cartesian2(10, -10 - trackIndex * 18),
                horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString('#05070c').withAlpha(0.7),
                backgroundPadding: new Cesium.Cartesian2(6, 4),
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6e5),
                disableDepthTestDistance: horizon.property,
              }
            : undefined,
        });
        if (p[4])
          waypointLabels.push({
            entity: wp,
            position: top,
            text: p[4],
            // First and last points of the main track matter most.
            priority: (track.kind === 'uap' ? 20 : 0) + (i === 0 || i === track.points.length - 1 ? 10 : 0) - trackIndex,
            dx: 10,
            dy: -10 - trackIndex * 18,
            charPx: 6.1,
            maxDistance: 6e5,
          });
      });

      // Moving contact.
      const sampled = new Cesium.SampledPositionProperty();
      sampled.setInterpolationOptions({
        interpolationDegree: 1,
        interpolationAlgorithm: Cesium.LinearApproximation,
      });
      for (const p of dense)
        sampled.addSample(
          Cesium.JulianDate.addSeconds(base, p[3], new Cesium.JulianDate()),
          Cesium.Cartesian3.fromDegrees(p[0], p[1], p[2]),
        );
      const first = Cesium.JulianDate.addSeconds(base, track.points[0][3], new Cesium.JulianDate());
      const last = Cesium.JulianDate.addSeconds(base, track.points.at(-1)[3], new Cesium.JulianDate());
      const span = Cesium.JulianDate.secondsDifference(stop, start);
      const mover = source.entities.add({
        name: track.label,
        availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: first, stop: last })]),
        position: sampled,
        billboard: {
          image: dotImage(color.toCssColorString(), track.kind === 'uap' ? 20 : 14),
          disableDepthTestDistance: horizon.property,
          scaleByDistance: new Cesium.NearFarScalar(1e4, 1.4, 5e6, 0.6),
        },
        label: {
          text: track.label,
          font: '600 11px JetBrains Mono, monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(14, 14),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          disableDepthTestDistance: horizon.property,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4e6),
        },
        path: {
          leadTime: 0,
          trailTime: Math.max(30, span * 0.25),
          width: 3,
          resolution: Math.max(1, span / 400),
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: color.withAlpha(0.9) }),
        },
      });
      mover.viewFrom = new Cesium.Cartesian3(-3000, -3000, 2000);
      movers.push({ entity: mover, track, first, last, sampled });
    }

    for (const obs of caseData.observers || []) {
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(obs.lon, obs.lat, 0),
        point: {
          pixelSize: 7,
          color: Cesium.Color.fromCssColorString('#ffd166'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: horizon.property,
        },
        label: {
          text: `◉ ${obs.label}`,
          font: '500 11px Inter, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#ffd166'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(10, 0),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2e6),
          disableDepthTestDistance: horizon.property,
        },
      });
      allPositions.push(Cesium.Cartesian3.fromDegrees(obs.lon, obs.lat, 0));
    }

    const clock = viewer.clock;
    clock.startTime = start.clone();
    clock.stopTime = stop.clone();
    clock.currentTime = start.clone();
    clock.clockRange = Cesium.ClockRange.CLAMPED;
    clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
    const duration = Cesium.JulianDate.secondsDifference(stop, start);
    const targetSeconds = Math.min(40, Math.max(12, duration));
    current = {
      caseData,
      start,
      stop,
      duration,
      baseMultiplier: duration / targetSeconds,
      speed: 1,
      movers,
      primary: (movers.find((m) => m.track.kind === 'uap') || movers[0])?.entity,
      sphere: Cesium.BoundingSphere.fromPoints(allPositions),
    };
    clock.multiplier = current.baseMultiplier;
    clock.shouldAnimate = false;
    viewer.scene.requestRender();
    return current;
  }

  function play() {
    if (!current) return;
    const clock = viewer.clock;
    if (Cesium.JulianDate.greaterThanOrEquals(clock.currentTime, current.stop))
      clock.currentTime = current.start.clone();
    clock.multiplier = current.baseMultiplier * current.speed;
    clock.shouldAnimate = true;
  }
  function pause() {
    viewer.clock.shouldAnimate = false;
  }
  function restart() {
    if (!current) return;
    viewer.clock.currentTime = current.start.clone();
    play();
  }
  function seek(fraction) {
    if (!current) return;
    viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
      current.start,
      current.duration * Math.min(1, Math.max(0, fraction)),
      new Cesium.JulianDate(),
    );
  }
  function setSpeed(speed) {
    if (!current) return;
    current.speed = speed;
    viewer.clock.multiplier = current.baseMultiplier * speed;
  }
  function progress() {
    if (!current) return 0;
    return Cesium.JulianDate.secondsDifference(viewer.clock.currentTime, current.start) / current.duration;
  }
  function follow(on) {
    if (!current?.primary) return;
    if (on) {
      witnessView(false);
      const r = Math.max(2000, Math.min(60000, current.sphere.radius * 0.25));
      current.primary.viewFrom = new Cesium.Cartesian3(-r, -r, r * 0.6);
      viewer.trackedEntity = current.primary;
    } else viewer.trackedEntity = undefined;
  }
  /* ── Witness view: ride with the witness, looking at the object ── */
  let pov = null; // { from, to, remove }
  const clampTime = (m, t) =>
    Cesium.JulianDate.lessThan(t, m.first) ? m.first : Cesium.JulianDate.greaterThan(t, m.last) ? m.last : t;

  /** Who watched what: the first non-UAP track (or a ground observer) paired with the first UAP track. */
  function witnessPair() {
    if (!current) return null;
    const target = current.movers.find((m) => m.track.kind === 'uap');
    if (!target) return null;
    const witness = current.movers.find((m) => m.track.kind !== 'uap' && m.track.kind !== 'meteor');
    if (witness) return { target, witness, label: witness.track.label };
    const obs = current.caseData.observers?.[0];
    if (obs) return { target, observer: obs, label: obs.label };
    return null;
  }

  function witnessView(on) {
    const controller = viewer.scene.screenSpaceCameraController;
    if (pov) {
      pov.remove();
      pov = null;
      controller.enableInputs = true;
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    if (!on) return false;
    const pair = witnessPair();
    if (!pair) return false;
    viewer.trackedEntity = undefined;
    controller.enableInputs = false;
    const scratchDir = new Cesium.Cartesian3();
    const scratchUp = new Cesium.Cartesian3();
    const scratchRight = new Cesium.Cartesian3();
    const ellipsoid = viewer.scene.globe.ellipsoid;
    let observerPos = null;
    if (pair.observer) {
      const carto = Cesium.Cartographic.fromDegrees(pair.observer.lon, pair.observer.lat);
      const ground = viewer.scene.globe.getHeight(carto) ?? 0;
      observerPos = Cesium.Cartesian3.fromDegrees(pair.observer.lon, pair.observer.lat, ground + 30);
    }
    const update = () => {
      const t = viewer.clock.currentTime;
      const from = observerPos || pair.witness.sampled.getValue(clampTime(pair.witness, t));
      const to = pair.target.sampled.getValue(clampTime(pair.target, t));
      if (!from || !to) return;
      // Sit just behind and above the witness so its own marker doesn't fill the view.
      Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(to, from, scratchDir), scratchDir);
      const upAtEye = ellipsoid.geodeticSurfaceNormal(from, scratchUp);
      const eye = Cesium.Cartesian3.add(
        from,
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(scratchDir, observerPos ? 0 : -60, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(upAtEye, observerPos ? 0 : 12, new Cesium.Cartesian3()),
          new Cesium.Cartesian3(),
        ),
        new Cesium.Cartesian3(),
      );
      const dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(to, eye, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(dir, upAtEye, scratchRight), scratchRight);
      const up = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(scratchRight, dir, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      viewer.camera.setView({ destination: eye, orientation: { direction: dir, up } });
    };
    const remove = viewer.scene.preRender.addEventListener(update);
    update();
    pov = { remove, label: pair.label };
    return pair.label;
  }

  function fit(duration = 2.0) {
    if (!current) return;
    const s = current.sphere;
    viewer.camera.flyToBoundingSphere(s, {
      duration,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-38), Math.max(s.radius * 2.6, 20000)),
    });
  }

  return {
    load,
    clear,
    play,
    pause,
    restart,
    seek,
    setSpeed,
    progress,
    follow,
    fit,
    witnessView,
    get witnessLabel() {
      return witnessPair()?.label || null;
    },
    get witnessOn() {
      return Boolean(pov);
    },
    get current() {
      return current;
    },
    get playing() {
      return viewer.clock.shouldAnimate;
    },
    onTick(fn) {
      tickListeners.add(fn);
    },
  };
}
