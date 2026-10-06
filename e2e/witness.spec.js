import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// In the Kinross case the F-89 and the object it chases end on the same point ("radar returns merge"). The witness view
// looks from one to the other, so at that moment there is no direction to look in, and it used to send the camera to NaN.
test('the witness view survives the moment the witness and the object meet', async ({ page }) => {
  const errors = await openApp(page);
  const finite = () =>
    page.evaluate(() => {
      const c = window.__uap.viewer.camera;
      return [c.position.x, c.position.y, c.position.z, c.direction.x, c.up.x].every(Number.isFinite);
    });
  await page.evaluate(() => window.__uap.select('case:kinross-moncla-1953'));
  await expect(page.locator('#pb-pov')).toBeVisible();
  await page.locator('#pb-pov').evaluate((b) => b.click());
  const seek = (v) =>
    page.evaluate((x) => {
      const s = document.getElementById('pb-scrub');
      s.value = x;
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  await seek(1000);
  await page.waitForTimeout(500);
  expect(await finite()).toBe(true);
  await seek(0);
  await page.waitForTimeout(500);
  expect(await finite()).toBe(true);
  expect(errors).toEqual([]);
});
