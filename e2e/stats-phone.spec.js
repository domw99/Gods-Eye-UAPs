import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// The records-per-year chart is drawn 640 units wide. Squeezed into a phone's width its 12px labels came out
// about 6px tall; it now keeps a readable width and scrolls sideways inside its box.
test('on a phone, the statistics chart keeps its labels readable and does not widen the dialog', async ({ page }) => {
  await openApp(page);
  await page.locator('#btn-stats').evaluate((b) => b.click());
  const label = page.locator('.stats-svg .sv-label').first();
  await expect(label).toBeVisible({ timeout: 30_000 });
  const box = await label.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const modal = await page.locator('.modal').boundingBox();
  expect(modal.x + modal.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(await page.locator('.stats-chart').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true); // the chart scrolls instead of shrinking
});
