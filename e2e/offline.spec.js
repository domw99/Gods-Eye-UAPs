import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// A link to an archive record (#/bluebook/…, #/geipan/…, #/mufon/…, #/journal/…) used to throw an unhandled rejection
// when the archive could not be fetched, and a layer that failed to load kept saying "loading…".
test('with the network gone, archive links fail quietly and a layer says it is offline', async ({ page, context }) => {
  const errors = await openApp(page);
  await context.setOffline(true);
  for (const hash of ['#/bluebook/1952-07-x', '#/geipan/x', '#/mufon/1967_09/3', '#/journal/x/1']) {
    await page.evaluate((h) => (location.hash = h), hash);
    await expect(page.locator('#toast')).toContainText(/Could not load/);
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.__uap.setLayer('nuforc', true));
  await expect(page.locator('#layers [data-layer="nuforc"] .state')).toHaveText('offline');
  expect(errors).toEqual([]);
});
