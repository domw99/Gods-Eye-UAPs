import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('on a phone, a case opens over the globe and back returns to the list', async ({ page }) => {
  await openApp(page);
  await page.locator('#case-list .case-item').first().tap();
  await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
  await page.locator('#dossier-back').tap();
  await expect(page.locator('#dossier')).toHaveClass(/hidden/);
  await expect(page.locator('#case-list .case-item').first()).toBeVisible();
});

test('on a phone, the app offers to be saved to the home screen, with steps for this browser', async ({ page }) => {
  await openApp(page);
  const install = page.locator('#btn-install');
  await expect(install).toBeVisible();
  await install.tap();
  await expect(page.locator('.modal .panel-title')).toHaveText('SAVE AS AN APP');
  await expect(page.locator('.install-steps li')).toHaveCount(3);
});

test('on a phone, EARTH | MOON sits beside the lighting, and the Moon list folds away like the Earth list', async ({ page }) => {
  const errors = await openApp(page);
  // The switch shares the first row of the top bar with the lighting.
  const sw = await page.locator('#world-switch').boundingBox();
  const light = await page.locator('#light-switch').boundingBox();
  expect(Math.abs(sw.y - light.y)).toBeLessThan(6);
  await page.locator('[data-world="moon"]').tap();
  await expect(page.locator('#moon-view canvas')).toBeVisible({ timeout: 60_000 });
  const box = await page.locator('#moon-left').boundingBox();
  const view = page.viewportSize();
  expect(box.width).toBeLessThanOrEqual(view.width);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#moon-collapse').tap();
  await expect(page.locator('#moon-left .panel-body')).toBeHidden();
  await page.locator('#moon-collapse').tap();
  await page.locator('#moon-list .case-item').first().tap();
  await expect(page.locator('#moon-dossier')).toBeVisible();
  await page.locator('[data-moon="close-dossier"]').tap();
  await expect(page.locator('#moon-dossier')).toBeHidden();
  await page.locator('[data-world="earth"]').tap();
  await expect(page.locator('#moon-view')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('on a phone, the close, back, play and view buttons are big enough for a finger', async ({ page }) => {
  await openApp(page);
  await page.locator('#case-list .case-item').first().tap();
  await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
  for (const sel of ['#dossier-close', '#dossier-back', '#tl-play', '#map-controls [data-view="in"]', '#map-controls [data-view="home"]']) {
    const box = await page.locator(sel).boundingBox();
    expect(Math.min(box.width, box.height), sel).toBeGreaterThanOrEqual(44);
  }
  expect((await page.locator('#tl-hide').boundingBox()).height).toBeGreaterThanOrEqual(36);
});

test('on a phone, the map data credit can be tapped, not hidden under the case list', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 60_000 });
  const reachable = await page.evaluate(() => {
    const a = document.querySelector('#globe .cesium-credit-expand-link');
    const b = a.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return a.contains(hit);
  });
  expect(reachable).toBe(true);
});

test('on a phone held sideways, the welcome card and the view controls stay below the top bar', async ({ page }) => {
  await page.setViewportSize({ width: 839, height: 412 });
  await openApp(page);
  await page.evaluate(() => (document.getElementById('welcome').hidden = false)); // browser tests skip the first-visit card
  const bar = await page.locator('.topbar').boundingBox();
  const card = await page.locator('#welcome').boundingBox();
  expect(card.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(card.y + card.height).toBeLessThanOrEqual(412);
  await page.locator('[data-welcome="close"]').tap();
  await page.evaluate(() => window.__uap.select('case:nimitz-tic-tac-2004', 'list'));
  await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
  const controls = page.locator('#map-controls');
  if (await controls.isVisible()) expect((await controls.boundingBox()).y).toBeGreaterThanOrEqual(bar.y + bar.height);
});

test('on a phone, playing a flight path clears the screen down to a slim playback bar, and DETAILS brings the panels back', async ({ page }) => {
  await openApp(page, '/#/case/nimitz-tic-tac-2004');
  await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
  await page.locator('#dossier-body [data-action="play"]').first().tap();
  const bar = page.locator('#playback');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  for (const sel of ['.topbar', '#dossier', '#left', '#timeline']) await expect(page.locator(sel)).toBeHidden();
  const box = await bar.boundingBox();
  expect(box.height).toBeLessThan(140);
  await page.locator('#pb-panels').tap();
  await expect(page.locator('#dossier')).toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
  await page.locator('#pb-panels').tap();
  await expect(page.locator('.topbar')).toBeHidden();
  await page.locator('#pb-close').tap();
  await expect(page.locator('.topbar')).toBeVisible();
});
