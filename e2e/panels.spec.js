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
