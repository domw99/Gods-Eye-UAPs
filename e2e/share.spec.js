import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers.js';

const audit = (page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).exclude('#globe canvas').analyze();

test.describe('Sharing and the pages search engines read', () => {
  test('a case page reached from a search stays a page; a link shared from the app opens the globe', async ({ page }) => {
    await page.goto('/case/nimitz-tic-tac-2004/');
    await expect(page.locator('h1')).toHaveText('USS Nimitz "Tic Tac"');
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe('/case/nimitz-tic-tac-2004/');
    await expect(page.locator('a.open').first()).toHaveAttribute('href', '../../#/case/nimitz-tic-tac-2004');
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(1);
    await expect(page.locator('h2', { hasText: 'Similar cases' })).toBeVisible();
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
    // A shared link (a fresh load, as a click from another site is).
    await page.goto('about:blank');
    await page.goto('/case/nimitz-tic-tac-2004/#globe');
    await page.waitForURL(/\/#\/case\/nimitz-tic-tac-2004$/);
  });

  test('SHARE offers the card, links that start a post on each site, and the link to copy', async ({ page }) => {
    const errors = await openApp(page, '/#/case/nimitz-tic-tac-2004');
    await expect(page.locator('#dossier-body .d-title')).toContainText('Nimitz');
    await page.locator('#dossier-body [data-action="share-card"]').first().click();
    const dialog = page.locator('.modal[aria-label="SHARE"]');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog.locator('.share-card-img')).toBeVisible();
    const link = await dialog.locator('.share-link input').inputValue();
    expect(link).toMatch(/\/case\/nimitz-tic-tac-2004\/#globe$/);
    const targets = dialog.locator('.share-targets a');
    await expect(targets).toHaveText(['X', 'Reddit', 'Bluesky', 'Facebook', 'WhatsApp', 'Telegram', 'LinkedIn', 'Email']);
    for (const href of await targets.evaluateAll((as) => as.map((a) => a.href))) expect(decodeURIComponent(href)).toContain(link);
    // They open in a new tab, and none is followed here.
    expect(await targets.evaluateAll((as) => as.every((a) => a.target === '_blank' || a.href.startsWith('mailto:')))).toBe(true);
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the case index and the open data are there, and the data downloads', async ({ page, request }) => {
    await page.goto('/case/');
    const count = await page.locator('main li a').count();
    expect(count).toBeGreaterThan(150);
    await expect(page.locator('h1')).toHaveText(`All ${count} case files`);
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
    await page.goto('/open-data/');
    await expect(page.locator('h1')).toContainText(`${count} UFO/UAP case files`);
    expect((await audit(page)).violations.map((v) => v.id)).toEqual([]);
    const json = await (await request.get('/open-data/cases.json')).json();
    expect(json.records).toHaveLength(count);
    const geo = await (await request.get('/open-data/cases.geojson')).json();
    expect(geo.type).toBe('FeatureCollection');
    const csv = await (await request.get('/open-data/cases.csv')).text();
    expect(csv.startsWith('id,title,date')).toBe(true);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/case/</loc>');
    expect(sitemap).toContain('/open-data/</loc>');
  });

  test('the front page links to the case index and the open data, and describes itself to search engines', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#left .made-by a[href="./case/"]')).toBeVisible();
    await expect(page.locator('#left .made-by a[href="./open-data/"]')).toBeVisible();
    const ld = JSON.parse(await page.locator('head script[type="application/ld+json"]').textContent());
    expect(ld['@graph'].map((x) => x['@type'])).toEqual(['WebSite', 'WebApplication', 'Dataset']);
  });
});
