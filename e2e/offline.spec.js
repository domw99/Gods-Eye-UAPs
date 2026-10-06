import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// The app keeps working for what is already on the page when the network goes. Two things used to give way:
// a link to an archive record (#/bluebook/…, #/geipan/…, #/mufon/…) threw an unhandled rejection when the archive
// could not be fetched, and the first flight path shown after that stopped Cesium drawing, because the small file
// its ground line needs was fetched only then.
test('with the network gone, archive links and flight paths fail quietly and the globe keeps drawing', async ({ page, context }) => {
  const errors = await openApp(page);
  await page.waitForTimeout(7000); // the app fetches what a flight path will need once it is idle
  await context.setOffline(true);
  for (const hash of ['#/bluebook/1952-07-x', '#/geipan/x', '#/mufon/1967_09/3', '#/journal/x/1']) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => window.__uap.select('case:kinross-moncla-1953'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__uap.setLayer('satellites', true)); // anything that draws a frame
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__uap.viewer.useDefaultRenderLoop)).toBe(true);
  expect(errors).toEqual([]);
});
