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
