import { expect } from '@playwright/test';

// Live services the smoke tests don't need; blocking them keeps runs fast and steady.
const BLOCK = /open-meteo|thespacedevs|wikipedia\.org|wikimedia\.org|photon\.komoot|celestrak|gibs\.earthdata|archive\.org/;

/** Open the app and wait until the globe and the case list are up. Returns the page errors seen. */
export async function openApp(page, path = '/') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(BLOCK, (route) => route.abort());
  await page.goto(path);
  await expect(page.locator('#case-list .case-item').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__uap?.viewer));
  return errors;
}

export const caseCount = async (page) => Number((await page.locator('#case-count').textContent()).match(/\d+/)[0]);
