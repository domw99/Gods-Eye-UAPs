/*
 * The on-screen keyboard. On a phone it takes the lower half of the screen; a field near the foot of a dialog or
 * the case list (the coordinates in "What did I see?", the search box) was left under it, because every panel is
 * fixed and only the box inside it scrolls, so the browser's own "scroll the field into view" had nothing to move.
 * When the visible area shrinks, the box holding the focused field scrolls just enough to show it.
 */

const MARGIN = 12;

/**
 * How far a scroll box must scroll (positive: down) so that a field shows inside both the box and the visible
 * part of the screen. Rectangles are {top, bottom}; 0 when the field already shows.
 */
export function revealShift(field, box, view, margin = MARGIN) {
  const top = Math.max(box.top, view.top) + margin;
  const bottom = Math.min(box.bottom, view.bottom) - margin;
  if (field.top < top) return field.top - top;
  if (field.bottom > bottom) return Math.min(field.bottom - bottom, field.top - top); // a tall field keeps its top in view
  return 0;
}

const isField = (el) => el instanceof HTMLElement && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select');

function scroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Keep the focused field in view while the keyboard opens (the window or the visual viewport shrinks). */
export function keepFieldAboveKeyboard(win = window) {
  let frame = 0;
  const check = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!isField(el)) return;
      const box = scroller(el);
      if (!box) return;
      const vv = win.visualViewport;
      const view = vv ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height } : { top: 0, bottom: win.innerHeight };
      const shift = revealShift(el.getBoundingClientRect(), box.getBoundingClientRect(), view);
      if (shift) box.scrollTop += shift;
    });
  };
  win.addEventListener('resize', check);
  win.visualViewport?.addEventListener('resize', check);
  // A field tapped while the keyboard is already up (the next field down) is checked too.
  win.addEventListener('focusin', () => setTimeout(check, 300));
}
