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

test('on a phone held sideways, the top bar keeps to two rows and a playing path gets one row along the foot', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await openApp(page, '/#/case/nimitz-tic-tac-2004');
  await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
  const bar = await page.locator('.topbar').boundingBox();
  expect(bar.height).toBeLessThan(100); // it was four rows, 176px, leaving the case list 120px
  expect((await page.locator('#left').boundingBox()).height).toBeGreaterThan(180);
  const pb = page.locator('#playback');
  await expect(pb).toBeVisible({ timeout: 15_000 });
  const box = await pb.boundingBox();
  expect(box.height).toBeLessThan(70);
  for (const sel of ['#dossier', '#left']) {
    const p = await page.locator(sel).boundingBox();
    expect(p.y + p.height, sel).toBeLessThanOrEqual(box.y + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('on a phone, the playback bar keeps ✕ on its first row, and a small phone gets two rows', async ({ page }) => {
  await openApp(page, '/#/case/nimitz-tic-tac-2004');
  await page.locator('#dossier-body [data-action="play"]').first().tap();
  await expect(page.locator('#playback')).toBeVisible({ timeout: 15_000 });
  await page.locator('#pb-panels').tap();
  await expect(page.locator('body')).not.toHaveClass(/pb-focus/);
  const play = await page.locator('#pb-play').boundingBox();
  const close = await page.locator('#pb-close').boundingBox();
  expect(Math.abs(close.y - play.y)).toBeLessThan(4);
  await page.setViewportSize({ width: 360, height: 740 });
  expect((await page.locator('#playback').boundingBox()).height).toBeLessThan(125); // DETAILS was left alone on a third row
  await page.locator('#pb-panels').tap();
  await expect(page.locator('body')).toHaveClass(/pb-focus/);
  expect((await page.locator('#playback').boundingBox()).height).toBeLessThan(125);
});

test('on a phone, ✕ on the playback bar ends the tour, whose STOP the watch mode hides', async ({ page }) => {
  await openApp(page);
  await page.locator('#btn-tour').tap();
  await expect(page.locator('body')).toHaveClass(/pb-focus/, { timeout: 20_000 });
  await page.locator('#pb-close').tap();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('#btn-tour')).toHaveText('▶ TOUR');
});

test('on a phone, the witness view says to tap its button to leave, and drops the badge that spoke of keys', async ({ page }) => {
  await openApp(page, '/#/case/nimitz-tic-tac-2004');
  await page.locator('#dossier-body [data-action="play"]').first().tap();
  await page.locator('#pb-pov').tap();
  await expect(page.locator('body')).toHaveClass(/\bpov\b/);
  await expect(page.locator('#toast')).toContainText('Tap WITNESS VIEW again to leave');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('globe'), '::after').display)).toBe('none');
});

test('on a phone, Back closes a dialog and leaves the case behind it open', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__uap.select('case:nimitz-tic-tac-2004', 'list')); // opened from the page, so Back can close it
  await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
  await page.locator('#btn-stats').evaluate((b) => b.click());
  await expect(page.locator('.modal')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
  expect(page.url()).toContain('#/case/nimitz-tic-tac-2004');
  // Closed with ✕, the dialog takes its entry with it: the next Back closes the case, as it did before.
  await page.locator('#btn-files').evaluate((b) => b.click());
  await page.locator('.modal .panel-head [data-close]').tap();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state?.dialog ?? null)).toBe(null);
  await page.goBack();
  await expect(page.locator('#dossier')).toHaveClass(/hidden/);
});

test('on a phone, a field the on-screen keyboard would cover scrolls up above it', async ({ page }) => {
  await openApp(page);
  await page.locator('#btn-explain').evaluate((b) => b.click());
  const lon = page.locator('.modal input[name="lon"]');
  await lon.scrollIntoViewIfNeeded();
  await lon.tap();
  const { width, height } = page.viewportSize();
  const left = Math.round(height * 0.5);
  await page.setViewportSize({ width, height: left }); // the keyboard takes the lower half
  await expect.poll(async () => { const b = await lon.boundingBox(); return b.y + b.height; }).toBeLessThanOrEqual(left);
  await expect(lon).toBeFocused();
});

test('on a phone, the buttons in the case file and the filter chips are big enough for a finger', async ({ page }) => {
  await openApp(page, '/#/case/nimitz-tic-tac-2004');
  for (const sel of ['[data-action="story"]', '[data-action="share-card"]', '[data-action="star"]']) {
    expect((await page.locator(`#dossier-body ${sel}`).first().boundingBox()).height, sel).toBeGreaterThanOrEqual(40);
  }
  await page.locator('#dossier-close').tap();
  await page.locator('#filters > summary').tap();
  const chips = await page.locator('#evidence-filters .chip').evaluateAll((a) => a.map((c) => c.getBoundingClientRect().height));
  expect(Math.min(...chips)).toBeGreaterThanOrEqual(32);
  expect((await page.locator('#search').boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('on a phone, the first visit says the app is roomier on a computer, once', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false })); // the note stays out of the way of automated runs
  await openApp(page);
  const note = page.locator('#phone-note');
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toContainText('Best on a computer');
  await expect(note.locator('button')).toBeFocused();
  await note.locator('button').tap();
  await expect(note).toBeHidden();
  await page.reload();
  await expect(page.locator('#case-list .case-item').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await expect(note).toBeHidden();
});
