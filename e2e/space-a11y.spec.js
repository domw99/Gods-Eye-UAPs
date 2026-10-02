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

test.describe('Space & Moon links', () => {
  test('a link opens the dialog on the right tab, scrolled to its report', async ({ page }) => {
    const errors = await openApp(page, '/#/space/moon-1963');
    await expect(page.locator('#space-panel-moon')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#space-tab-moon')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#sp-moon-1963')).toHaveClass(/flash/);
    await expect(page.locator('#sp-moon-1963')).toBeInViewport();
    expect(errors).toEqual([]);
  });

  test('a tab name opens that tab, and anything else opens the first', async ({ page }) => {
    await openApp(page, '/#/space/deep');
    await expect(page.locator('#space-panel-deep')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.evaluate(() => (location.hash = '#/space/no-such-report'));
    await expect(page.locator('#space-panel-orbit')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(() => (location.hash = '#/space'));
    await expect(page.locator('#space-panel-orbit')).toBeVisible();
  });

  test('following a link while a case is open closes the case and keeps the link', async ({ page }) => {
    await openApp(page);
    await page.locator('#case-list .case-item').first().click();
    await expect(page.locator('#dossier')).not.toHaveClass(/hidden/);
    await page.evaluate(() => (location.hash = '#/space/oumuamua'));
    await expect(page.locator('#space-panel-deep')).toBeVisible();
    await expect(page.locator('#dossier')).toHaveClass(/hidden/);
    expect(await page.evaluate(() => location.hash)).toBe('#/space/oumuamua');
  });

  test('COPY LINK on a report puts its link on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page);
    await page.locator('#btn-space').click();
    await page.locator('#sp-gemini-4 [data-copy]').click();
    await expect(page.locator('#toast')).toContainText('Link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#\/space\/gemini-4$/);
  });
});

test.describe('Moon map', () => {
  test('opens from the top bar with a globe, places and pins, and Esc returns to the Earth', async ({ page }) => {
    const errors = await openApp(page);
    await page.locator('#btn-moon').click();
    await expect(page.locator('#moon-view canvas')).toBeVisible({ timeout: 60_000 });
    expect(await page.locator('#moon-view .moon-item').count()).toBeGreaterThan(100);
    await expect(page.locator('#moon-view [data-key^="report:"]')).toHaveCount(6);
    expect(await page.evaluate(() => location.hash)).toBe('#/moon');
    // The Earth is switched off behind it: no drawing, no keys, nothing to tab to.
    expect(await page.evaluate(() => window.__uap.viewer.useDefaultRenderLoop)).toBe(false);
    expect(await page.locator('#left').evaluate((el) => el.closest('[inert]') !== null || el.hasAttribute('inert'))).toBe(true);
    await page.keyboard.press('k');
    await expect(page.locator('#modal-root .modal')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#moon-view')).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect(await page.evaluate(() => window.__uap.viewer.useDefaultRenderLoop)).toBe(true);
    await page.keyboard.press('k');
    await expect(page.locator('#modal-root .modal')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('flies to a place from the list, shows what it is, and goes back to the list', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('u');
    await expect(page.locator('#moon-view canvas')).toBeVisible({ timeout: 60_000 });
    await page.locator('[data-key="place:apollo-11"]').click();
    await expect(page.locator('#moon-detail h3')).toHaveText('Apollo 11');
    await expect(page.locator('#moon-detail')).toContainText('20 Jul 1969');
    expect(await page.evaluate(() => location.hash)).toBe('#/moon/apollo-11');
    await page.locator('[data-moon="all"]').click();
    await expect(page.locator('#moon-list')).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe('#/moon');
  });

  test('search narrows the list by name, English name or year', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-moon').click();
    await expect(page.locator('#moon-search')).toBeVisible({ timeout: 60_000 });
    await page.locator('#moon-search').fill('tranquility');
    await expect(page.locator('#moon-list .moon-item')).toContainText(['Mare Tranquillitatis']);
    await page.locator('#moon-search').fill('1972');
    await expect(page.locator('#moon-list')).toContainText('Apollo 17');
    await page.locator('#moon-search').fill('zzzzqq');
    await expect(page.locator('#moon-list .moon-none')).toBeVisible();
    // Esc clears the search first, and only then closes.
    await page.keyboard.press('Escape');
    await expect(page.locator('#moon-search')).toHaveValue('');
    await expect(page.locator('#moon-view')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#moon-view')).toHaveCount(0);
  });

  test('a link opens a lunar report, and Back leaves the map', async ({ page }) => {
    await openApp(page, '/#/moon/moon-1963');
    await expect(page.locator('#moon-detail')).toContainText('Greenacre and Barr', { timeout: 60_000 });
    await expect(page.locator('#moon-detail')).toContainText('WHAT IS KNOWN');
    // Opened from a link: closing clears the address instead of stepping back out of the app.
    await page.locator('[data-moon="close"]').click();
    await expect(page.locator('#moon-view')).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe('');
    // Opened from the page: Back closes it.
    await page.locator('#btn-moon').click();
    await expect(page.locator('#moon-view canvas')).toBeVisible({ timeout: 60_000 });
    await page.goBack();
    await expect(page.locator('#moon-view')).toHaveCount(0);
    expect(await page.evaluate(() => window.__uap.viewer.useDefaultRenderLoop)).toBe(true);
  });

  test('the keyboard turns and zooms the Moon, and clicking a pin on the globe shows its report', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('u');
    await expect(page.locator('#moon-view canvas')).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.__uap.moonGlobe() && window.__uap.moonGlobe().viewer.entities.values.length > 100);
    const where = () => page.evaluate(() => window.__uap.moonGlobe().where());
    await expect.poll(async () => (await where()).height, { timeout: 20_000 }).toBeLessThan(4_000_000); // the first fly-in has finished
    const home = await where();
    await page.locator('#moon-globe').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await where()).lon, { timeout: 5_000 }).toBeGreaterThan(home.lon + 5);
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await where()).lat, { timeout: 5_000 }).toBeGreaterThan(home.lat + 5);
    await page.keyboard.press('+');
    await expect.poll(async () => (await where()).height, { timeout: 8_000 }).toBeLessThan(home.height * 0.8);
    await page.keyboard.press('0');
    await expect.poll(async () => Math.abs((await where()).lon), { timeout: 15_000 }).toBeLessThan(1);
    // N hides the names and shows them again.
    const labels = () => page.evaluate(() => window.__uap.moonGlobe().viewer.entities.values.filter((e) => e.label).map((e) => e.label.show.getValue()));
    await page.keyboard.press('n');
    expect((await labels()).every((v) => v === false)).toBe(true);
    await page.keyboard.press('n');
    expect((await labels()).every((v) => v === true)).toBe(true);
    // A pin: hover names it, a click opens its report.
    const at = await page.evaluate(() => {
      const v = window.__uap.moonGlobe().viewer;
      const p = v.scene.cartesianToCanvasCoordinates(v.entities.getById('report:moon-1958').position.getValue(v.clock.currentTime));
      const r = v.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y - 12 };
    });
    await page.mouse.move(at.x, at.y);
    await expect(page.locator('.moon-tip')).toContainText('Kozyrev at Alphonsus');
    await page.mouse.click(at.x, at.y);
    await expect(page.locator('#moon-detail h3')).toHaveText('Kozyrev at Alphonsus');
  });

  test('the Moon tab of Space & Moon opens the map', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-space').click();
    await page.locator('#space-tab-moon').click();
    await page.locator('[data-moon-globe]').click();
    await expect(page.locator('#moon-view canvas')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#modal-root .modal')).toHaveCount(0);
  });

  test('COPY LINK gives a link that opens that place', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page, '/#/moon/tycho');
    await expect(page.locator('#moon-detail h3')).toHaveText('Tycho', { timeout: 60_000 });
    await page.locator('#moon-detail [data-copy]').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#\/moon\/tycho$/);
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-moon').click();
    await expect(page.locator('#moon-view canvas')).toBeVisible({ timeout: 60_000 });
    await page.locator('[data-key="report:moon-1958"]').click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).exclude('.moon-globe canvas').analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
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
