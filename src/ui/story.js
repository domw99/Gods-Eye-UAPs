import * as Cesium from 'cesium';
import { skyAt, compass } from '../services/sky.js';
import { STATUS } from '../data/taxonomy.js';

/**
 * Story mode: a narrated fly-through of one case. Captions step through the
 * setting, what happened (the timeline, with the flight path playing), the
 * sky at the time and the official assessment. Narration uses the browser's
 * built-in speech synthesis when available; otherwise captions advance on a
 * reading-speed timer.
 */
const VOICE_KEY = 'gods-eye-uap:story-voice';
const RANGE = { site: 9000, city: 22000, area: 140000, region: 1600000 };

// Titles and initials that end in a full stop but don't end a sentence.
const ABBREV = /(?:^|[\s(])(?:[A-Z]|U\.S|U\.K|Lt|Cdr|Capt|Col|Gen|Sgt|Cst|Flt|Dr|Mr|Mrs|Ms|St|Mt|Ft|No|Jr|Sr|vs|approx|e\.g|i\.e|a\.m|p\.m)$/;

/** Split prose into sentences without breaking at "U.S.", "Lt." or initials. */
export function sentences(text) {
  const out = [];
  let start = 0;
  const re = /[.!?]+["”’)]?(?=\s+["“(]?[A-Z0-9]|\s*$)/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(start, m.index);
    if (m[0][0] === '.' && ABBREV.test(before)) continue;
    out.push(text.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.length ? out : [text];
}

function skySentence(c) {
  try {
    const sky = skyAt(c.lat, c.lon, c.date);
    const shown = sky.bodies
      .filter((b) => b.alt > 3 && (b.kind !== 'star' || b.mag < -0.5))
      .slice(0, 3)
      .map((b) => `${b.name === 'Moon' ? 'the Moon' : b.name} ${b.alt < 20 ? 'low' : b.alt > 55 ? 'high' : ''} in the ${compass(b.az)}`.replace('  ', ' '));
    const light = sky.light === 'Daylight' ? 'It was daytime' : sky.light === 'Night' ? 'It was night' : `It was ${sky.light.toLowerCase()}`;
    const text = shown.length ? `${light}. Above the horizon: ${shown.join(', ')}.` : `${light}.`;
    return c.timeApprox ? `The exact time isn't recorded, but around then: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
  } catch {
    return null;
  }
}

export function buildStory(c) {
  const date = new Date(c.date);
  const when = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const steps = [
    { kicker: 'CASE FILE', text: `${c.title}. ${c.place}, ${when}.`, camera: 'space' },
    ...sentences(c.summary).reduce((acc, s, i) => {
      // Two sentences per caption keeps each one readable.
      if (i % 2 === 0) acc.push({ kicker: 'WHAT HAPPENED', text: s, camera: i === 0 ? 'site' : null });
      else acc[acc.length - 1].text += ` ${s}`;
      return acc;
    }, []),
    ...(c.timeline || []).map((e, i) => ({ kicker: e.t.toUpperCase(), text: e.text, camera: i === 0 ? 'path' : null })),
  ];
  const sky = skySentence(c);
  if (sky) steps.push({ kicker: 'THE SKY THAT MOMENT', text: sky });
  steps.push({
    kicker: `ASSESSMENT — ${(STATUS[c.status]?.label || c.status).toUpperCase()}`,
    text: c.explanation || STATUS[c.status]?.long || '',
  });
  return steps.filter((s) => s.text);
}

export function createStory({ viewer, trackLayer, onStop = () => {} }) {
  const el = document.getElementById('story');
  const kicker = el.querySelector('.story-kicker');
  const text = el.querySelector('.story-text');
  const bar = el.querySelector('.story-progress i');
  const btnPause = el.querySelector('[data-story="pause"]');
  const btnVoice = el.querySelector('[data-story="voice"]');
  const canSpeak = 'speechSynthesis' in window;
  let voiceOn = canSpeak;
  try {
    if (localStorage.getItem(VOICE_KEY) === 'off') voiceOn = false;
  } catch {
    /* ignore */
  }
  let state = null; // { c, steps, i, paused, timer, orbit }

  function speak(t, done) {
    if (!voiceOn || !canSpeak) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.rate = 1.02;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    return true;
  }

  function stopOrbit() {
    if (state?.orbit) {
      state.orbit();
      state.orbit = null;
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
  }

  function orbit(c) {
    stopOrbit();
    const center = Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0);
    const range = RANGE[c.precision] || 40000;
    let heading = 0;
    state.orbit = viewer.scene.preRender.addEventListener(() => {
      heading += 0.0009;
      viewer.camera.lookAt(center, new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-32), range));
    });
  }

  function camera(step, c) {
    if (step.camera === 'space') {
      stopOrbit();
      viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat - 12, 4.5e6), duration: 2.5 });
    } else if (step.camera === 'site') {
      stopOrbit();
      const run = state; // callbacks below must not act on a later story
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 0), 10), {
        duration: 3.2,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-32), RANGE[c.precision] || 40000),
        complete: () => state === run && !c.tracks?.length && orbit(c),
      });
    } else if (step.camera === 'path') {
      if (trackLayer.current) {
        stopOrbit();
        trackLayer.fit(2);
        const run = state;
        setTimeout(() => state === run && trackLayer.restart(), 2100);
      }
    }
  }

  function show(i) {
    if (!state) return;
    clearTimeout(state.timer);
    state.i = i;
    if (i >= state.steps.length) return stop();
    const step = state.steps[i];
    kicker.textContent = step.kicker;
    text.textContent = step.text;
    bar.style.width = `${Math.round(((i + 1) / state.steps.length) * 100)}%`;
    camera(step, state.c);
    if (state.paused) return;
    // Every caption stays up at least long enough to read, even if speech
    // ends early (some browsers report speech but have no voices installed).
    const words = step.text.split(/\s+/).length;
    const readMs = Math.max(3500, words * 330 + 1500);
    const began = Date.now();
    const next = () => {
      if (!state || state.paused || state.i !== i) return;
      const minMs = voiceOn && canSpeak ? Math.max(2500, words * 240) : readMs;
      state.timer = setTimeout(() => show(i + 1), Math.max(700, minMs - (Date.now() - began)));
    };
    if (!speak(`${step.kicker === 'CASE FILE' || step.kicker === 'WHAT HAPPENED' ? '' : `${step.kicker.toLowerCase()}. `}${step.text}`, next))
      state.timer = setTimeout(() => show(i + 1), readMs);
  }

  function start(c) {
    stop(true);
    state = { c, steps: buildStory(c), i: 0, paused: false, timer: null, orbit: null };
    el.classList.remove('hidden');
    document.body.classList.add('story-on');
    btnPause.textContent = '❚❚';
    btnVoice.setAttribute('aria-pressed', String(voiceOn));
    btnVoice.hidden = !canSpeak;
    show(0);
  }

  function stop(silent = false) {
    if (!state) return;
    clearTimeout(state.timer);
    if (canSpeak) speechSynthesis.cancel();
    stopOrbit();
    state = null;
    el.classList.add('hidden');
    document.body.classList.remove('story-on');
    if (!silent) onStop();
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-story]');
    if (!b || !state) return;
    const action = b.dataset.story;
    if (action === 'stop') stop();
    else if (action === 'next') show(state.i + 1);
    else if (action === 'prev') show(Math.max(0, state.i - 1));
    else if (action === 'pause') {
      state.paused = !state.paused;
      btnPause.textContent = state.paused ? '▶' : '❚❚';
      if (state.paused) {
        clearTimeout(state.timer);
        if (canSpeak) speechSynthesis.cancel();
      } else show(state.i);
    } else if (action === 'voice') {
      voiceOn = !voiceOn;
      b.setAttribute('aria-pressed', String(voiceOn));
      try {
        localStorage.setItem(VOICE_KEY, voiceOn ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      if (!voiceOn && canSpeak) speechSynthesis.cancel();
      show(state.i);
    }
  });

  return {
    start,
    stop,
    get active() {
      return Boolean(state);
    },
  };
}
