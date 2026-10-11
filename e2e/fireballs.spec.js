import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test.describe('Fireballs', () => {
  test.use({ timezoneId: 'UTC' });

  test('the layer lists NASA’s fireballs and a click on one opens its file', async ({ page }) => {
    const errors = await openApp(page);
    const row = page.locator('#layers [data-layer="fireballs"]');
    await expect(row).toContainText('Fireballs');
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(row.locator('.state')).toHaveText(/^\d{3}$/, { timeout: 30_000 });
    // Look down at the Chelyabinsk fireball (15 February 2013) and click the middle of the screen.
    await page.evaluate(() => {
      const { viewer } = window.__uap;
      const p = viewer.scene.globe.ellipsoid.cartographicToCartesian({ longitude: (61.1 * Math.PI) / 180, latitude: (54.8 * Math.PI) / 180, height: 600_000 });
      viewer.camera.setView({ destination: p, orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } });
    });
    await page.waitForTimeout(1500);
    const canvas = page.locator('#globe canvas').first();
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#dossier-body .d-title')).toContainText('Fireball', { timeout: 20_000 });
    await expect(page.locator('#dossier-body')).toContainText('15 Feb 2013');
    await expect(page.locator('#dossier-body')).toContainText('about 441 kt of TNT');
    expect(errors).toEqual([]);
  });

  test('the sighting checker offers a fireball for a fast light ten minutes after one over Chelyabinsk, and a case file says when none was recorded', async ({ page }) => {
    const errors = await openApp(page);
    await page.locator('#btn-explain').click();
    const dialog = page.locator('.modal[aria-label="WHAT DID I SEE?"]');
    await dialog.locator('input[name="date"]').fill('2013-02-15T03:30');
    await dialog.locator('input[name="lat"]').fill('55.1500');
    await dialog.locator('input[name="lon"]').fill('61.4000');
    await dialog.locator('select[name="motion"]').selectOption('fast');
    await dialog.locator('button[type="submit"]').click();
    const results = dialog.locator('#ex-results');
    await expect(results.locator('.ex-list li').first()).toBeVisible({ timeout: 60_000 });
    await expect(results.locator('.ex-list li').first()).toContainText('Fireball (NASA record)');
    await expect(results.locator('.ex-list li').first()).toContainText('before your sighting');
    await expect(results.locator('.caveat').first()).toContainText('fireballs in NASA’s record');
    await page.keyboard.press('Escape');
    await page.goto('about:blank');
    await openApp(page, '/#/case/nimitz-tic-tac-2004');
    await expect(page.locator('#d-fireballs')).toContainText('No fireball in NASA’s record within 600 km and 3 hours', { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
});

test.describe('Compass and tilt', () => {
  test('north up turns the view the short way, and tilt leans the view over and back', async ({ page }) => {
    const errors = await openApp(page);
    const north = page.locator('#map-controls [data-view="north"]');
    const tilt = page.locator('#map-controls [data-view="tilt"]');
    await expect(north).toHaveAccessibleName('North up');
    await expect(tilt).toHaveAccessibleName('Tilt the view');
    // Close to the ground, turned away from north.
    await page.evaluate(() => {
      const { viewer } = window.__uap;
      const p = viewer.scene.globe.ellipsoid.cartographicToCartesian({ longitude: (-104.5 * Math.PI) / 180, latitude: (33.4 * Math.PI) / 180, height: 400_000 });
      viewer.camera.setView({ destination: p, orientation: { heading: (50 * Math.PI) / 180, pitch: (-88 * Math.PI) / 180, roll: 0 } });
    });
    await expect(north).not.toHaveClass(/level/);
    await north.click();
    await expect.poll(() => page.evaluate(() => { const h = ((window.__uap.viewer.camera.heading * 180) / Math.PI + 360) % 360; return Math.min(h, 360 - h); }), { timeout: 10_000 }).toBeLessThan(1);
    await expect(north).toHaveClass(/level/);
    await expect(tilt).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('p');
    await expect(tilt).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    const pitch = () => page.evaluate(() => (window.__uap.viewer.camera.pitch * 180) / Math.PI);
    await expect.poll(pitch, { timeout: 10_000 }).toBeGreaterThan(-60);
    await tilt.click();
    await expect(tilt).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
    await expect.poll(pitch, { timeout: 10_000 }).toBeLessThan(-85);
    // High above the Earth there is nothing to lean over: it says so.
    await page.evaluate(() => window.__uap.resetView());
    await page.waitForTimeout(3500);
    await tilt.click();
    await expect(page.locator('#toast')).toContainText('Zoom in closer to tilt the view');
    await expect(tilt).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });
});
