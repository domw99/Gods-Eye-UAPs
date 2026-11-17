/**
 * When the globe's graphics context is lost. A browser can take a page's WebGL
 * context back: a phone short of graphics memory, a graphics driver that
 * restarts, a tab left long in the background. Cesium does not rebuild its
 * scene afterwards, so the globe stays blank with no word why. This says so
 * and offers a reload; the address keeps the open case, so nothing is lost.
 */
import { t } from '../i18n/index.js';

/**
 * Call `onLost` the first time `canvas` loses its WebGL context. Returns a
 * function that stops watching (for a canvas whose context is given up on
 * purpose, as the Moon's is when it closes).
 */
export function watchContextLoss(canvas, onLost) {
  if (!canvas?.addEventListener) return () => {};
  let fired = false;
  const handler = (event) => {
    if (fired) return;
    fired = true;
    onLost(event);
  };
  canvas.addEventListener('webglcontextlost', handler);
  return () => canvas.removeEventListener('webglcontextlost', handler);
}

/**
 * Show the notice in #gl-lost (an empty role="alert" box in index.html, filled
 * only now so screen readers announce it) with a button that reloads the page.
 */
export function showContextLost(doc = document) {
  const box = doc.getElementById('gl-lost');
  if (!box || !box.hidden) return;
  const text = doc.createElement('p');
  text.textContent = t('The globe stopped drawing: the browser took back the graphics memory it was using. Reload the page to bring it back; the case you had open stays open.');
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'chip';
  button.textContent = t('RELOAD');
  button.addEventListener('click', () => doc.defaultView?.location.reload());
  box.replaceChildren(text, button);
  box.hidden = false;
  button.focus();
}
