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
