import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

// Keyboard and layout details of the panels (dossier, lists, timeline, Moon list).

test.describe('panels', () => {
  test('long words in a logged sighting wrap instead of widening the dossier and the list', async ({ page }) => {
    const entry = {
      id: 'wide',
      title: `Lights${'x'.repeat(70)}`,
      date: '2024-05-01T03:00:00.000Z',
      lat: 40.1,
      lon: -105.2,
      shape: 'light',
      duration: 'A'.repeat(90),
      witnesses: '3',
      description: `See https://example.com/${'a'.repeat(120)}`,
      media: `https://example.com/${'path/'.repeat(40)}file.mp4`,
    };
    await page.addInitScript((e) => localStorage.setItem('gods-eye-uap:log', JSON.stringify([e])), entry);
    await openApp(page);
    await page.evaluate(() => window.__uap.select('user:wide', 'list'));
    await expect(page.locator('#dossier-body .d-title')).toContainText('Lights');
    const fits = (sel) => page.evaluate((s) => document.querySelector(s).scrollWidth <= document.querySelector(s).clientWidth, sel);
    expect(await fits('#dossier-body')).toBe(true);
    expect(await fits('#left .panel-body')).toBe(true);
  });

  test('the star button keeps the keyboard focus when it flips', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__uap.select('case:nimitz-tic-tac-2004', 'list'));
    const star = page.locator('#dossier-body [data-action="star"]');
    await star.focus();
    await page.keyboard.press('Enter');
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dossier-body [data-action="star"]')).toBeFocused();
    await page.keyboard.press('Enter'); // and back
    await expect(page.locator('#dossier-body [data-action="star"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#dossier-body [data-action="star"]')).toBeFocused();
  });

  test('filter chips and layer switches keep the keyboard focus when they redraw', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => document.querySelector('details.filters')?.setAttribute('open', ''));
    for (const sel of ['[data-evidence="video"]', '[data-status="unresolved"]', '[data-layer="official"]']) {
      await page.locator(sel).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator(sel)).toBeFocused();
    }
    // Removing a chip from the "filtered by" bar hands the focus to the next one, not to the page.
    await page.locator('[data-clear-evidence="video"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#active-filters button:focus')).toHaveCount(1);
  });

  test('a choice in the map settings keeps the focus on the control that was used', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('m');
    await page.locator('#ms-light [data-light="day"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#ms-light [data-light="day"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#ms-light [data-light="day"]')).toBeFocused();
  });

  test('a sky check that finishes after another record was opened does not write into it', async ({ page }) => {
    const entry = (id, lat) => ({ id, title: `Light ${id}`, date: '2024-05-01T03:00:00.000Z', lat, lon: -105.2, shape: 'light', duration: '', witnesses: '', description: '', media: '' });
    await page.addInitScript((list) => localStorage.setItem('gods-eye-uap:log', JSON.stringify(list)), [entry('a', 40), entry('b', -30)]);
    await openApp(page);
    await page.route(/celestrak/, async (route) => {
      await new Promise((r) => setTimeout(r, 600)); // each element set takes a while to arrive
      route.abort();
    });
    await page.evaluate(() => window.__uap.select('user:a', 'list'));
    await page.locator('#dossier-body [data-action="skycheck"]').click();
    await expect(page.locator('#d-sky')).toContainText('Loading satellite orbits');
    await page.evaluate(() => window.__uap.select('user:b', 'list'));
    await expect(page.locator('#dossier-body .d-title')).toContainText('Light b');
    await page.waitForTimeout(8000); // the first check has answered by now
    await expect(page.locator('#d-sky')).toHaveText('');
  });

  test('the timeline play button is named for what it does now', async ({ page }) => {
    await openApp(page);
    const play = page.locator('#tl-play');
    await expect(play).toHaveAttribute('aria-label', 'Play history');
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Stop playback');
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Play history');
  });

  test('a picture in a case file opens full size from the keyboard, and focus comes back', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.__uap.select('official:7201780', 'list')); // an official image
    const card = page.locator('#dossier-body .media-card').first();
    await expect(card).toHaveAttribute('role', 'button');
    await expect(card).toHaveAttribute('aria-label', /Enlarge picture/);
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.lightbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.lightbox')).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test('the map dialog does not come back after it was closed while a map style was loading', async ({ page }) => {
    await openApp(page);
    await page.route(/arcgisonline/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500)); // a slow map service
      route.abort();
    });
    await page.keyboard.press('m');
    await page.locator('#ms-style [data-style="dark"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('#toast')).toContainText('could not be loaded', { timeout: 15_000 }); // the request is over
    await page.waitForTimeout(500);
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  });

  test('closing the Moon dossier puts the focus back on the row it came from', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => document.querySelector('[data-world="moon"]').click());
    const row = page.locator('#moon-list .case-item').first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    const key = await row.getAttribute('data-key');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#moon-dossier')).not.toHaveClass(/hidden/);
    await page.locator('#moon-dossier [data-moon="close-dossier"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#moon-dossier')).toHaveClass(/hidden/);
    await expect(page.locator(`#moon-list [data-key="${key}"]`)).toBeFocused();
  });
});
