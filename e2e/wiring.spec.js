import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// The app's wiring: addresses, saved data, layers and lookups that finish after the person has moved on.
const done = (page) => expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 30_000 });
const click = (page, selector) => page.locator(selector).dispatchEvent('click');

test.describe('wiring', () => {
  test('a saved sighting with no date does not stop the app starting', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('gods-eye-uap:log', JSON.stringify([{ id: 'x', lat: 10, lon: 10 }, null, 5])));
    const errors = await openApp(page);
    await done(page);
    expect(errors).toEqual([]);
    await expect(page.locator('[data-layer="user"] .state')).toHaveText('0');
  });

  test('a #/near/ address that is not a place leaves the camera alone', async ({ page }) => {
    await openApp(page, '/#/near/1.2.3,4.5.6');
    await expect(page.locator('#toast')).toContainText('Nothing found');
    await expect(page.locator('#dossier')).toHaveClass(/hidden/);
    expect(await page.evaluate(() => { const c = window.__uap.viewer.camera.position; return [c.x, c.y, c.z].every(Number.isFinite); })).toBe(true);
  });

  test('a layer switched off while it loads stays off the years bar', async ({ page }) => {
    await page.route(/bluebook\.json/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await openApp(page);
    // Blue Book's line on the years bar is amber (#ffb547); nothing else there is.
    const amber = () =>
      page.locator('#tl-canvas').evaluate((canvas) => {
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 255) < 14 && Math.abs(d[i + 1] - 181) < 14 && Math.abs(d[i + 2] - 71) < 14 && d[i + 3] > 120) n++;
        return n;
      });
    await click(page, '[data-layer="bluebook"]');
    await click(page, '[data-layer="bluebook"]');
    await expect(page.locator('[data-layer="bluebook"]')).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(3500); // the file arrives
    expect(await amber()).toBe(0);
    await click(page, '[data-layer="bluebook"]');
    await expect.poll(amber).toBeGreaterThan(0); // and it does draw when the layer is on
  });

  test('a layer whose file cannot load says offline, not loading', async ({ page }) => {
    await page.route(/geipan\.json/, (route) => route.abort());
    await openApp(page);
    await click(page, '[data-layer="geipan"]');
    await expect(page.locator('[data-layer="geipan"] .state')).toHaveText('offline');
  });

  test('opening an old case loads the archives without leaving "loading…" in the layer list', async ({ page }) => {
    await openApp(page, '/#/case/kenneth-arnold-1947'); // looks up Blue Book, the journals and MUFON
    await expect(page.locator('#d-bluebook')).not.toContainText('Searching', { timeout: 30_000 });
    for (const layer of ['bluebook', 'mufon', 'journals']) await expect(page.locator(`[data-layer="${layer}"] .state`)).not.toHaveText('loading…');
  });

  test('a Blue Book link whose file cannot load fails quietly', async ({ page }) => {
    await page.route(/bluebook\.json/, (route) => route.abort());
    const errors = await openApp(page, '/#/bluebook/1952-07-7273984-Tremonton-Utah-1377-');
    await expect(page.locator('#toast')).toContainText('Could not load Blue Book layer');
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('opening a Blue Book file takes the orbit view of the case before it away', async ({ page }) => {
    await openApp(page);
    const layers = () => page.evaluate(() => window.__uap.viewer.imageryLayers.length);
    const before = await layers();
    await page.evaluate(() => window.__uap.select('case:nimitz-tic-tac-2004'));
    await page.evaluate(() => window.__uap.setOrbitDay('2004-11-14'));
    expect(await layers()).toBe(before + 1);
    await page.evaluate(() => window.__uap.selectBlueBook('1952-07-7273984-Tremonton-Utah-1377-'));
    await expect(page.locator('#dossier-id')).toHaveText('PROJECT BLUE BOOK');
    expect(await layers()).toBe(before);
  });

  test('resetting the filters drops a place lookup that is still waiting', async ({ page }) => {
    await openApp(page);
    await page.route(/photon\.komoot/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ features: [{ properties: { name: 'Paris', country: 'France' }, geometry: { coordinates: [2.35, 48.85] } }] }) }),
    );
    // Type, and clear it all the moment the search has applied: the lookup waits 450 ms before it asks.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const input = document.getElementById('search');
          input.value = 'paris';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const poll = setInterval(() => {
            const reset = document.querySelector('#active-filters [data-clear="all"]');
            if (!reset) return;
            clearInterval(poll);
            reset.click();
            resolve();
          }, 5);
        }),
    );
    await page.waitForTimeout(1500);
    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('#place-results li')).toHaveCount(0);
  });

  test('toggling a layer does not scroll the panel to the open case', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__uap.select('case:kenneth-arnold-1947')); // far down the newest-first list
    const body = page.locator('#left .panel-body');
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000);
    await body.evaluate((el) => (el.scrollTop = 0));
    await click(page, '[data-layer="official"]');
    await page.waitForTimeout(500);
    expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test('Esc in the search box clears the words first and keeps the case file open', async ({ page }) => {
    await openApp(page, '/#/case/nimitz-tic-tac-2004');
    await expect(page.locator('#dossier-body .d-title')).toBeVisible();
    await page.locator('#search').fill('radar');
    await page.locator('#search').press('Escape');
    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
    await expect(page.locator('#active-filters [data-clear="search"]')).toHaveCount(0);
    await page.locator('#search').press('Escape'); // nothing to clear now: the case file closes
    await expect(page.locator('#dossier')).toHaveClass(/hidden/);
  });

  test('the play buttons say whether they are playing', async ({ page }) => {
    await openApp(page, '/#/case/nimitz-tic-tac-2004');
    const play = page.locator('#pb-play');
    await expect(play).toBeVisible();
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', 'true');
    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', 'false');
  });

  test('the sweep through the years stops when its range is cleared', async ({ page }) => {
    await openApp(page);
    await click(page, '#tl-play');
    await expect(page.locator('#tl-play')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#active-filters [data-clear="years"]')).toBeVisible();
    await click(page, '#active-filters [data-clear="all"]');
    await expect(page.locator('#tl-play')).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1200); // two more steps would have set a range again
    expect(await page.evaluate(() => window.__uap.state.yearRange)).toBeNull();
  });

  test('in an embed, Space with no flight path does not sweep the hidden years bar', async ({ page }) => {
    await page.goto('/?embed=1#/case/utsuro-bune-1803'); // the case list is hidden here, so openApp would wait for it in vain
    await page.waitForFunction(() => Boolean(window.__uap?.viewer), null, { timeout: 60_000 });
    await expect(page.locator('#dossier-body .d-title')).toBeVisible();
    await page.keyboard.press('Space');
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__uap.state.yearRange)).toBeNull();
    await page.keyboard.press('f'); // the clean view's way out is hidden in an embed too
    expect(await page.evaluate(() => document.body.classList.contains('clean'))).toBe(false);
  });
});
