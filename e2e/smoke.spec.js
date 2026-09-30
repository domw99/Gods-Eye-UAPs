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

  test('lighting and starred cases are remembered', async ({ page }) => {
    await openApp(page, '/#/case/socorro-zamora-1964');
    await page.keyboard.press('m');
    await expect(page.locator('#ms-style [data-style]')).toHaveCount(4);
    await page.locator('#ms-light [data-light="night"]').click();
    await expect(page.locator('#ms-light [data-light="night"]')).toHaveClass(/on/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#hud-map')).toContainText('· NIGHT');
    await page.locator('#dossier-body [data-action="star"]').click();
    await expect(page.locator('#dossier-body [data-action="star"]')).toHaveText('★ STARRED');
    await page.reload();
    await expect(page.locator('#case-list .case-item').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#hud-map')).toContainText('· NIGHT', { timeout: 20_000 });
    await page.locator('#filters summary').click();
    await page.locator('[data-starred-only]').click();
    await expect(page.locator('#case-list .case-item')).toHaveCount(1);
    await expect(page.locator('#case-list .case-item')).toContainText('Socorro');
  });

  test('lighting is one click away in the top bar', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#light-switch [data-light="auto"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#light-switch [data-light="night"]').click();
    await expect(page.locator('#light-switch [data-light="night"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#light-switch [data-light="auto"]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#hud-map')).toContainText('· NIGHT');
    await page.locator('#light-switch [data-light="off"]').click();
    await expect(page.locator('#hud-map')).toContainText('· OFF');
    await page.keyboard.press('d'); // the key cycles on from the current choice and the bar follows
    await expect(page.locator('#light-switch [data-light="auto"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('3D buildings start off, and the layer list shows each layer with its own symbol', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => window.__uap.state.layers.buildings)).toBe(false);
    await expect(page.locator('#layers [data-layer="buildings"]')).toHaveAttribute('aria-pressed', 'false');
    const symbols = await page.locator('#layers svg.swatch path.body').evaluateAll((els) => els.map((e) => e.getAttribute('d')));
    expect(symbols.length).toBeGreaterThanOrEqual(8);
    expect(new Set(symbols).size).toBe(symbols.length); // no two layers share a symbol
  });

  test('the map controls return to the edge when the dossier closes, at any width', async ({ page }) => {
    await openApp(page);
    const rightGap = () => page.locator('#map-controls').evaluate((el) => Math.round(innerWidth - el.getBoundingClientRect().right));
    const closedGap = await rightGap();
    for (const width of [1280, 900]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => window.__uap.select('case:socorro-zamora-1964', 'list'));
      await expect.poll(rightGap).toBeGreaterThan(300); // clear of the open dossier
      await page.locator('#dossier-close').click();
      await expect.poll(rightGap).toBeLessThan(closedGap + 6);
      await page.evaluate(() => window.__uap.select('case:socorro-zamora-1964', 'list'));
      await expect.poll(rightGap).toBeGreaterThan(300);
      await page.keyboard.press('Escape');
      await expect.poll(rightGap).toBeLessThan(closedGap + 6);
    }
  });

  test('the top bar is back to its height after the window is resized narrow and wide again', async ({ page }) => {
    await openApp(page);
    const barHeight = () => page.locator('.topbar').evaluate((el) => Math.round(el.getBoundingClientRect().height));
    const wide = await barHeight();
    await page.setViewportSize({ width: 560, height: 800 });
    await expect.poll(barHeight).toBeGreaterThan(wide + 20);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(barHeight).toBeLessThan(wide + 4);
  });

  test('the years bar can be hidden, brought back, and is remembered', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#timeline')).toBeVisible();
    const panelBottom = () => page.locator('#left').evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    const withBar = await panelBottom();
    await page.locator('#tl-hide').click();
    await expect(page.locator('#timeline')).toBeHidden();
    await expect(page.locator('#tl-show')).toBeVisible();
    await expect.poll(panelBottom).toBeGreaterThan(withBar + 20); // the panels grow into the space
    await page.reload();
    await expect(page.locator('#case-list .case-item').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#timeline')).toBeHidden();
    await page.keyboard.press('y');
    await expect(page.locator('#timeline')).toBeVisible();
    await expect.poll(panelBottom).toBeLessThan(withBar + 4);
  });

  test('clean view hides the panels and a case brings them back', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('f');
    await expect(page.locator('body')).toHaveClass(/clean/);
    await expect(page.locator('#clean-exit')).toBeVisible();
    await page.evaluate(() => window.__uap.select('case:socorro-zamora-1964', 'list'));
    await expect(page.locator('body')).not.toHaveClass(/clean/);
    await expect(page.locator('#dossier-body .d-title')).toHaveText(/Socorro/);
  });

  test('a logged sighting opens, then can be deleted', async ({ page }) => {
    const errors = await openApp(page);
    await page.keyboard.press('l');
    await page.locator('#log-form [name=title]').fill('Three silent orange lights');
    await page.locator('#log-form [name=lat]').fill('51.5');
    await page.locator('#log-form [name=lon]').fill('-0.12');
    await page.locator('#log-form button[type=submit]').click();
    await expect(page.locator('#dossier-body .d-title')).toHaveText('Three silent orange lights');
    await expect(page).toHaveURL(/#\/user\//);
    // Two presses in a row (in the page, so a slow machine can't let the question time out between them).
    const asked = await page.evaluate(() => {
      const del = document.querySelector('[data-action=delete-user]');
      del.click();
      const text = del.textContent;
      del.click();
      return text;
    });
    expect(asked).toMatch(/again/);
    await expect(page.locator('#dossier')).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
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
