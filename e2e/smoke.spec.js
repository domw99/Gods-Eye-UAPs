import { test, expect } from '@playwright/test';
import { openApp, caseCount } from './helpers.js';

test.describe('God’s Eye // UAP', () => {
  test('boots with the globe, the case list and the loading screen gone', async ({ page }) => {
    const errors = await openApp(page);
    expect(await caseCount(page)).toBeGreaterThan(250);
    await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 30_000 });
    await expect(page.locator('.cesium-widget canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('opens a case, then goes back', async ({ page }) => {
    await openApp(page);
    await page.locator('#search').fill('socorro');
    await page.locator('#case-list .case-item', { hasText: 'Socorro landing' }).click();
    await expect(page.locator('#dossier-body .d-title')).toHaveText(/Socorro landing/);
    await expect(page).toHaveURL(/#\/case\/socorro-zamora-1964$/);
    await expect(page.locator('#dossier-body')).toContainText('SKY AT THE TIME');
    await page.goBack();
    await expect(page.locator('#dossier')).toHaveClass(/hidden/);
  });

  test('zooming out with the wheel ends level, with the globe in the middle', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() =>
      window.__uap.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-112.07, 33.2, 30000),
        orientation: { heading: Cesium.Math.toRadians(40), pitch: Cesium.Math.toRadians(-30), roll: 0 },
      }),
    );
    // Off to one side of the globe, where Cesium's own zoom-out would drift.
    const box = await page.locator('.cesium-widget canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3);
    for (let i = 0; i < 24; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(80);
    }
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = window.__uap.viewer.camera;
            const toEarth = Cesium.Cartesian3.normalize(Cesium.Cartesian3.negate(c.positionWC, new Cesium.Cartesian3()), new Cesium.Cartesian3());
            return Cesium.Math.toDegrees(Math.acos(Cesium.Cartesian3.dot(toEarth, c.directionWC)));
          }),
        { timeout: 20_000 },
      )
      .toBeLessThan(1);
    expect(await page.evaluate(() => window.__uap.viewer.camera.positionCartographic.height)).toBeGreaterThan(8e6);
  });

  test('filters narrow the list and reset clears them', async ({ page }) => {
    await openApp(page);
    const all = await caseCount(page);
    await page.locator('#filters summary').click();
    await page.locator('[data-status="unresolved"]').click();
    await page.locator('[data-evidence="radar"]').click();
    await expect(page.locator('#active-filters')).toContainText('RADAR');
    const some = await caseCount(page);
    expect(some).toBeLessThan(all);
    expect(some).toBeGreaterThan(0);
    await page.locator('#active-filters [data-clear="all"]').click();
    await expect(page.locator('#active-filters')).toBeHidden();
    expect(await caseCount(page)).toBe(all);
  });

  test('deep links open Blue Book, GEIPAN and journal pages', async ({ page }) => {
    await openApp(page, '/#/geipan/1981-01-00849');
    await expect(page.locator('#dossier-body .d-title')).toHaveText(/GEIPAN case — Trans-en-Provence/);
    await page.goto('/#/bluebook/1952-07-7273984-Tremonton-Utah-1377-');
    await expect(page.locator('#dossier-body .d-title')).toContainText('Tremonton');
    await page.goto('/#/mufon/1978_01/3');
    await expect(page.locator('#dossier-id')).toHaveText('MUFON FILES');
  });

  test('archive layers load their data', async ({ page }) => {
    await openApp(page);
    for (const layer of ['geipan', 'journals']) {
      await page.locator(`[data-layer="${layer}"]`).click();
      await expect(page.locator(`[data-layer="${layer}"] .state`)).toHaveText(/^\d{1,3}(,\d{3})+$/);
    }
  });

  test('journal search finds pages', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-files').click();
    await page.locator('#files-js input').fill('Delphos ring');
    await page.locator('#files-js button').click();
    await expect(page.locator('.js-summary')).toContainText(/\d+ pages? mention delphos \+ ring/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal .panel-title')).toHaveText('FILES');
  });

  test('statistics chart every archive', async ({ page }) => {
    await openApp(page);
    await page.locator('#btn-stats').click();
    await expect(page.locator('.stats-svg')).toBeVisible();
    await expect(page.locator('.stats-body .bar-row').first()).toBeVisible();
  });

  test('grouping can be switched off and is remembered', async ({ page }) => {
    await openApp(page);
    const group = page.locator('#map-controls [data-view="group"]');
    await group.click();
    await expect(group).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('#map-controls [data-view="group"]')).toHaveAttribute('aria-pressed', 'false');
  });
});
