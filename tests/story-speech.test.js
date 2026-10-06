import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CASES } from '../src/data/cases/index.js';
import { buildStory, createStory } from '../src/ui/story.js';

// A stand-in for the browser's speech synthesis: cancel() ends the utterance with an
// "error" event a moment later, as Chrome does.
class FakeSynth {
  speak(u) {
    this.current = u;
  }
  cancel() {
    const u = this.current;
    this.current = null;
    if (u) queueMicrotask(() => u.onerror?.({ error: 'canceled' }));
  }
}

function setup() {
  const shown = [];
  const text = {};
  Object.defineProperty(text, 'textContent', { set: (v) => shown.push(v), get: () => shown.at(-1) });
  const make = () => ({ textContent: '', style: {}, hidden: false, dataset: {}, setAttribute() {} });
  const kicker = make();
  const bar = make();
  const buttons = { pause: make(), voice: make() };
  const el = {
    classList: { add() {}, remove() {} },
    querySelector: (sel) => ({ '.story-kicker': kicker, '.story-text': text, '.story-progress i': bar, '[data-story="pause"]': buttons.pause, '[data-story="voice"]': buttons.voice })[sel],
    addEventListener: (type, fn) => type === 'click' && (el.click = fn),
  };
  globalThis.document = { getElementById: () => el, body: { classList: { add() {}, remove() {} } } };
  globalThis.window = globalThis;
  globalThis.speechSynthesis = new FakeSynth();
  globalThis.SpeechSynthesisUtterance = class {
    constructor(t) {
      this.text = t;
    }
  };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const story = createStory({ viewer: { camera: { flyTo() {}, flyToBoundingSphere() {}, lookAtTransform() {} }, scene: { preRender: { addEventListener: () => () => {} } } }, trackLayer: { current: null } });
  const press = (action) => el.click({ target: { closest: () => ({ dataset: { story: action }, setAttribute() {} }) } });
  return { story, shown, press };
}

describe('story mode narration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    for (const k of ['document', 'window', 'speechSynthesis', 'SpeechSynthesisUtterance', 'localStorage']) delete globalThis[k];
  });

  it('turning the voice off mid-caption does not show the next caption twice', async () => {
    const c = CASES.find((x) => x.id === 'nimitz-tic-tac-2004');
    const steps = buildStory(c);
    const { story, shown, press } = setup();
    story.start(c);
    expect(shown).toEqual([steps[0].text]);
    await vi.advanceTimersByTimeAsync(3000); // the voice is still reading the first caption
    press('voice'); // off: the spoken caption is cancelled and the story carries on by the clock
    await vi.advanceTimersByTimeAsync(7000);
    expect(shown.filter((s) => s === steps[1].text)).toHaveLength(1);
    story.stop(true);
  });

  it('a finished utterance moves the story on, once', async () => {
    const c = CASES.find((x) => x.id === 'nimitz-tic-tac-2004');
    const steps = buildStory(c);
    const { story, shown } = setup();
    story.start(c);
    globalThis.speechSynthesis.current.onend(); // the voice finished the first caption
    await vi.advanceTimersByTimeAsync(4000);
    expect(shown.slice(0, 2)).toEqual([steps[0].text, steps[1].text]);
    story.stop(true);
  });
});
