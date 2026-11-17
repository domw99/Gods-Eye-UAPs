/*
 * The case list and the Moon's list of places are listboxes of a few hundred rows. Every row used to be its own
 * Tab stop, so a keyboard user had to press Tab hundreds of times to get past the list to the dossier, the map
 * controls or the years bar. As in the ARIA listbox pattern, the list is now one Tab stop (the open record's row,
 * else the one last used, else the first) and the arrow keys, Home and End move inside it.
 */

const ROW = '[role="option"]';

/** Give the list a single Tab stop: the focused row if the focus is in it, else the selected row, else the first. */
export function rove(list) {
  const rows = list.querySelectorAll(ROW);
  if (!rows.length) return;
  const all = [...rows];
  const stop = all.find((li) => li === document.activeElement) || all.find((li) => li.getAttribute('aria-selected') === 'true') || all[0];
  for (const li of all) li.tabIndex = li === stop ? 0 : -1;
}

/** The row the arrow keys, Home and End go to from `li`, or null for any other key. */
function target(list, li, key) {
  if (key === 'ArrowDown') return li.nextElementSibling;
  if (key === 'ArrowUp') return li.previousElementSibling;
  if (key === 'Home') return list.querySelector(ROW);
  if (key === 'End') return [...list.querySelectorAll(ROW)].pop();
  return null;
}

/**
 * Wire a listbox: the row with the focus becomes its Tab stop, and the arrow keys, Home and End move between rows.
 * Returns true from `onKey` for a key it handled, so the caller can stop it from also turning the globe.
 */
export function bindListbox(list) {
  list.addEventListener('focusin', (e) => {
    const li = e.target.closest?.(ROW);
    if (li && li.tabIndex !== 0) rove(list);
  });
  return function onKey(e) {
    const li = e.target.closest?.(ROW);
    if (!li || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return false;
    e.preventDefault();
    target(list, li, e.key)?.focus();
    return true;
  };
}

/**
 * How to bring a row into its scroll box: null when it already shows whole (a row just clicked stays put),
 * 'nearest' when it is partly in view, and 'center' when it is out of view (opened from the globe, a link or the
 * tour), so it arrives with its neighbours around it and is still in view if the rows above it settle a little
 * later (fonts and counts arriving moved it out from under a 'nearest' scroll). Rectangles are {top, bottom}.
 */
export function rowScroll(row, box) {
  if (row.top >= box.top && row.bottom <= box.bottom) return null;
  return row.bottom > box.top && row.top < box.bottom ? 'nearest' : 'center';
}

function scroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
}

/** Scroll a row of a list into view as rowScroll says. */
export function revealRow(row) {
  const box = scroller(row);
  if (!box) return void row.scrollIntoView({ block: 'nearest' });
  const block = rowScroll(row.getBoundingClientRect(), box.getBoundingClientRect());
  if (block) row.scrollIntoView({ block });
}
