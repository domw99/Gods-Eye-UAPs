import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers.js';
import { onThisDay } from '../src/data/onthisday.js';
import { CASES } from '../src/data/cases/index.js';

// The case list is hidden in an embed, so wait for the globe itself.
async function openEmbed(page, path) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/open-meteo|thespacedevs|wikipedia\.org|wikimedia\.org|photon\.komoot|celestrak|gibs\.earthdata|archive\.org/, (route) => route.abort());
  await page.goto(path);
  await page.waitForFunction(() => Boolean(window.__uap?.viewer), null, { timeout: 60_000 });
  return errors;
}

const audit = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).exclude('#globe canvas').analyze();

test.describe('Finding things', () => {
  test('typed coordinates are a place at once: one row, no lookup, and it shows what is reported near there', async ({ page }) => {
    const errors = await openApp(page);
    const search = page.locator('#search');
    await search.fill('33.3943, -104.5230');
    const row = page.locator('#place-results [data-coords]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('33.3943° N, 104.5230° W');
    await expect(page.locator('#place-results li')).toHaveCount(1);
    await row.click();
    await expect(page.locator('#dossier-body')).toContainText('33.3943° N', { timeout: 30_000 });
    expect(page.url()).toMatch(/#\/near\/33\.3943,-104\.5230\//);
    // The radar scope: every record near the place as a link, at its bearing and distance.
    const radar = page.locator('#dossier-body svg.radar');
    await expect(radar).toBeVisible();
    await expect(radar).toHaveAttribute('aria-label', /^Radar view: \d+ records within 250 km, north at the top$/);
    expect(await radar.locator('a').count()).toBeGreaterThan(0);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
    const first = radar.locator('a').first();
    const href = await first.getAttribute('href');
    await first.click({ force: true });
    await expect.poll(() => page.url(), { timeout: 15_000 }).toContain(decodeURIComponent(href.slice(1)).split('/').slice(0, 2).join('/'));
    await page.goBack();
    // Degrees, minutes and seconds with hemispheres, as in a report or a map link.
    await search.fill(`33°23'39"N 104°31'23"W`);
    await expect(page.locator('#place-results [data-coords]')).toContainText('33.3942° N, 104.5231° W');
    // A military grid reference is a place too, and the HUD reads the grid under the camera.
    await search.fill('13S ES 44360 95102');
    await expect(page.locator('#place-results [data-coords]')).toContainText('33.3943° N, 104.5230° W');
    await expect(page.locator('#hud-mgrs')).toHaveText(/^\d{1,2}[C-X]( [A-Z]{2}( \d{1,5} \d{1,5})?)?$/);
    // Words are still a search, not a place.
    await search.fill('Roswell');
    await expect(page.locator('#place-results [data-coords]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('What did I see?: airfields and the aurora', () => {
  test.use({ timezoneId: 'UTC' });

  test('a coloured, still glow over Minot at midnight in the great storm of March 1989 is an aurora; blinking and steady it is an aircraft out of the base', async ({ page }) => {
    const errors = await openApp(page);
    await page.locator('#btn-explain').click();
    const dialog = page.locator('.modal[aria-label="WHAT DID I SEE?"]');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="date"]').fill('1989-03-14T06:00');
    await dialog.locator('input[name="lat"]').fill('48.4150');
    await dialog.locator('input[name="lon"]').fill('-101.3570');
    await dialog.locator('select[name="motion"]').selectOption('still');
    await dialog.locator('input[name="colours"]').check();
    await dialog.locator('button[type="submit"]').click();
    const results = dialog.locator('#ex-results');
    await expect(results.locator('.ex-list li').first()).toBeVisible({ timeout: 60_000 });
    await expect(results.locator('.ex-list li').first()).toContainText('Aurora (Kp 8-)');
    await expect(results.locator('.ex-list li').first()).toContainText('severe storm (G4)');
    await expect(results.locator('.caveat').first()).toContainText('airfields within 80 km');
    await expect(results.locator('.caveat').first()).toContainText('geomagnetic activity (Kp)');
    // The same light, moving steadily and blinking, is an aircraft out of the base.
    await dialog.locator('select[name="motion"]').selectOption('steady');
    await dialog.locator('input[name="blinking"]').check();
    await dialog.locator('button[type="submit"]').click();
    await expect(results.locator('.ex-list li').first()).toContainText('Aircraft from Minot Air Force Base', { timeout: 60_000 });
    await expect(results.locator('.ex-list li').first()).toContainText('military field');
    expect(errors).toEqual([]);
  });

  test('a case file shows the Kp index and the airfields near it', async ({ page }) => {
    const errors = await openApp(page, '/#/case/minot-afb-1968');
    await expect(page.locator('#dossier-body .d-title')).toContainText('Minot');
    const geo = page.locator('#d-geomag');
    await expect(geo).toContainText('KP INDEX', { timeout: 30_000 });
    await expect(geo).toContainText('three-hour interval');
    const fields = page.locator('#d-airfields');
    await expect(fields.locator('.airfield-list li').first()).toContainText('Minot Air Force Base', { timeout: 30_000 });
    await expect(fields.locator('.airfield-list li').first()).toContainText('MILITARY');
    await expect(fields.locator('.airfield-list li').first()).toContainText('less than 1 km away');
    // At sea there is none within 80 km.
    await page.goto('about:blank');
    await openApp(page, '/#/case/nimitz-tic-tac-2004');
    await expect(page.locator('#d-airfields')).toContainText('No airport or airfield within 80 km.', { timeout: 30_000 });
    expect(errors).toEqual([]);
  });
});

test.describe('Place search from the keyboard', () => {
  test('Down enters the rows and Up leaves them; Enter in the box goes to the first place', async ({ page }) => {
    const errors = await openApp(page);
    const search = page.locator('#search');
    await search.fill('48.4150, -101.3570');
    await expect(page.locator('#place-results [data-coords]')).toBeVisible();
    await search.press('ArrowDown');
    await expect(page.locator('#place-results [data-coords]')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(search).toBeFocused();
    await search.press('Enter');
    await expect(page.locator('#dossier-body')).toContainText('48.4150° N', { timeout: 30_000 });
    expect(page.url()).toMatch(/#\/near\/48\.4150,-101\.3570\//);
    expect(errors).toEqual([]);
  });
});

test.describe('On this day', () => {
  // The date itself is covered by tests/onthisday.test.js; here the block follows whatever today is.
  test('lists the cases of today\'s date above the list when there are some, and opens one', async ({ page }) => {
    const today = onThisDay(CASES);
    const errors = await openApp(page);
    const block = page.locator('#on-this-day');
    if (!today.length) {
      await expect(block).toBeHidden();
      return;
    }
    await expect(block).toBeVisible();
    await expect(block).toContainText('ON THIS DAY');
    await expect(block.locator('[data-otd]')).toHaveCount(Math.min(4, today.length));
    await expect(block).toContainText(today[0].date.slice(0, 4));
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 }); // the loading screen is not part of what is audited
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
    await block.locator('[data-otd]').first().click();
    await expect(page.locator('#dossier-body .d-title')).toContainText(today[0].title.slice(0, 12));
    expect(errors).toEqual([]);
  });
});

test.describe('Embed mode', () => {
  test('?embed=1 shows the globe and a case file, with a way out to the full app', async ({ page }) => {
    const errors = await openEmbed(page, '/?embed=1#/case/nimitz-tic-tac-2004');
    await expect(page.locator('body')).toHaveClass(/embed/);
    await expect(page.locator('#dossier-body .d-title')).toContainText('Nimitz');
    for (const hidden of ['#left', '#timeline', '.modes', '#btn-files', '#welcome']) await expect(page.locator(hidden), hidden).toBeHidden();
    const open = page.locator('#embed-open');
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('target', '_blank');
    await open.hover();
    await open.focus();
    // The link is made when it is used, so it carries the case that is open.
    const href = await open.evaluate((a) => {
      a.addEventListener('click', (e) => e.preventDefault(), { once: true });
      a.click();
      return a.href;
    });
    expect(href).toMatch(/#\/case\/nimitz-tic-tac-2004$/);
    expect(href).not.toContain('embed');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('without the flag the full app is unchanged, and the share dialog offers the embed code', async ({ page }) => {
    await openApp(page, '/#/case/nimitz-tic-tac-2004');
    await expect(page.locator('body')).not.toHaveClass(/embed/);
    await expect(page.locator('#left')).toBeVisible();
    await expect(page.locator('#embed-open')).toBeHidden();
    await page.locator('#dossier-body [data-action="share-card"]').first().click();
    const dialog = page.locator('.modal[aria-label="SHARE"]');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    const code = await dialog.locator('.share-embed textarea').inputValue();
    expect(code).toMatch(/^<iframe src="[^"]+\?embed=1#\/case\/nimitz-tic-tac-2004"/);
    await expect(dialog.locator('[data-share="copy-embed"]')).toBeVisible();
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
  });
});
