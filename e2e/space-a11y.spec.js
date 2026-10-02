import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers.js';

const audit = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).exclude('#globe canvas').analyze();

test.describe('Space & Moon', () => {
  test('opens from the top bar and with K, with three tabs and the Moon map', async ({ page }) => {
    const errors = await openApp(page);
    await page.locator('#btn-space').click();
    await expect(page.locator('.modal [role="tab"]')).toHaveCount(3);
    await expect(page.locator('#space-panel-orbit')).toBeVisible();
    await expect(page.locator('#space-panel-moon')).toBeHidden();
    await page.locator('#space-tab-moon').click();
    await expect(page.locator('.moon-frame img')).toBeVisible();
    expect(await page.locator('.moon-pin').count()).toBeGreaterThanOrEqual(5);
    // A pin jumps to its report.
    await page.locator('.moon-pin').first().click();
    await expect(page.locator('.space-card.flash')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-root .modal')).toHaveCount(0);
    await page.keyboard.press('k');
    await expect(page.locator('.modal')).toBeVisible();
    // Arrow keys move between the tabs.
    await page.locator('#space-tab-orbit').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#space-tab-moon')).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
  });

  test('links its NASA files to the official records, and flies to where an orbit report was made', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-space').click();
    await page.locator('#sp-mercury-fireflies .sc-files a').first().click();
    await expect(page.locator('#modal-root .modal')).toHaveCount(0);
    await expect(page.locator('#dossier-body .d-title')).toContainText('NASA-UAP');
    await page.locator('#btn-space').click();
    await page.locator('[data-fly="gemini-4"]').click();
    await expect(page.locator('#modal-root .modal')).toHaveCount(0);
    await expect(page.locator('#dossier')).toHaveClass(/hidden/);
  });
});

test.describe('Keyboard and screen readers', () => {
  test('the skip link jumps to search, and a dialog keeps Tab inside itself', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('#skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#search')).toBeFocused();
    await page.locator('#btn-about').click();
    await expect(page.locator('#left')).toHaveAttribute('inert', '');
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#modal-root') || document.activeElement === document.body)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#left')).not.toHaveAttribute('inert', '');
  });

  test('opening a case from the list with Enter moves focus into it, and Escape brings it back', async ({ page }) => {
    await openApp(page);
    await page.locator('#search').fill('nimitz');
    await expect.poll(() => page.locator('#case-list .case-item').count()).toBeLessThan(15); // the search has narrowed the list
    const row = page.locator('#case-list .case-item', { hasText: 'Nimitz' }).first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#dossier')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#case-list .case-item:focus')).toHaveCount(1);
  });

  test('L opens the sighting form with the cursor in an empty title, and a blank title is refused', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('l');
    const title = page.locator('#log-form [name="title"]');
    await expect(title).toBeFocused();
    await expect(title).toHaveValue(''); // the L that opened the form is not typed into it
    await page.keyboard.type('   ');
    await page.locator('#log-form').evaluate((f) => f.requestSubmit());
    await expect(page.locator('#log-form')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('title');
  });

  test('has no detectable accessibility violations on the start screen, a case file or the dialogs', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    const check = async (label) => {
      const { violations } = await audit(page);
      expect(violations.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`), label).toEqual([]);
    };
    await check('start');
    await page.evaluate(() => window.__uap.select('case:nimitz-tic-tac-2004', 'list'));
    await expect(page.locator('#dossier-body .d-title')).toBeVisible();
    await check('case file');
    await page.keyboard.press('Escape');
    await page.locator('#btn-about').click();
    await check('about');
    await page.keyboard.press('Escape');
    await page.locator('#btn-space').click();
    await check('space, in orbit');
    await page.locator('#space-tab-moon').click();
    await check('space, the Moon');
  });
});
