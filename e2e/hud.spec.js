import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

/**
 * The camera readout in the lower right, the map controls above it, the Cesium
 * credit under it and the playback bar along the foot of the globe all share one
 * corner. None of them may hide another's text.
 */
const OVERLAPS = () => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const shown = (el) => el && el.getClientRects().length > 0;
  const text = (row) => {
    const range = document.createRange();
    range.selectNodeContents(row);
    return rect(range);
  };
  const parts = [];
  for (const row of document.querySelectorAll('.hud-br > div')) parts.push([`readout ${row.textContent.trim().slice(0, 12)}`, text(row)]);
  for (const [name, sel] of [['map controls', '#map-controls'], ['playback bar', '#playback'], ['credit', '#globe .cesium-widget-credits'], ['dossier', '#dossier']]) {
    const el = document.querySelector(sel);
    if (shown(el)) parts.push([name, rect(el)]);
  }
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const found = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      if (!(parts[i][0].startsWith('readout') && parts[j][0].startsWith('readout')) && hit(parts[i][1], parts[j][1])) found.push(`${parts[i][0]} / ${parts[j][0]}`);
  return found;
};

test('the camera readout stays clear of the map controls', async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(OVERLAPS)).toEqual([]);
});

test('with a flight path playing, the readout and the credit stay clear of the playback bar and the map controls', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__uap.select('case:nimitz-tic-tac-2004'));
  await expect(page.locator('#playback')).toBeVisible();
  // The controls slide clear of the dossier; wait for that to finish before measuring.
  await expect.poll(() => page.evaluate(OVERLAPS), { timeout: 15_000 }).toEqual([]);
});
