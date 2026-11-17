import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { watchContextLoss } from '../src/app/glloss.js';

const lose = (canvas) => canvas.dispatchEvent(new Event('webglcontextlost'));

describe('a lost graphics context', () => {
  it('is reported once, however often the browser fires it', () => {
    const canvas = new EventTarget();
    const onLost = vi.fn();
    watchContextLoss(canvas, onLost);
    lose(canvas);
    lose(canvas);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost.mock.calls[0][0].type).toBe('webglcontextlost');
  });

  it('is not reported for other events, or after watching stops', () => {
    const canvas = new EventTarget();
    const onLost = vi.fn();
    const stop = watchContextLoss(canvas, onLost);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    stop();
    lose(canvas);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('does nothing without a canvas', () => {
    expect(() => watchContextLoss(null, () => {})()).not.toThrow();
  });

  it('is watched on the Earth globe, not the Moon, whose context is given up on purpose when it closes', () => {
    expect(readFileSync('src/main.js', 'utf8')).toMatch(/watchContextLoss\(viewer\.scene\.canvas,/);
    expect(readFileSync('src/app/moonglobe.js', 'utf8')).not.toMatch(/watchContextLoss/);
  });
});
