#!/usr/bin/env node
/**
 * Render each case's share card into public/cards/<id>.jpg: the image its
 * page (case/<id>/) shows when the link is posted on X, Reddit, Discord…
 * It drives the built app in Chromium, so serve a build first:
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/build-cards.mjs [--force] [http://localhost:4173/] [case ids…]
 *
 * Existing cards are kept unless --force is given or the ids are named.
 * Rebuild afterwards so the case pages point at the new cards.
 * Without a GPU Chromium draws the globe with SwiftShader: slow but fine.
 * PW_CHROMIUM points at a preinstalled Chromium; PW_ARGS adds launch flags.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { CASES } from '../src/data/cases/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public/cards');
const SITE = process.env.SITE_URL || 'https://domw99.github.io/Gods-Eye-UAPs/';

const args = process.argv.slice(2);
const force = args.includes('--force');
const app = args.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:4173/';
const named = args.filter((a) => !a.startsWith('--') && !/^https?:\/\//.test(a));
const cases = named.length ? CASES.filter((c) => named.includes(c.id)) : CASES.filter((c) => force || !existsSync(path.join(OUT, `${c.id}.jpg`)));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(process.env.PW_ARGS || '').split(' ').filter(Boolean)],
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })).newPage();
  // The card only needs the globe; skip the dossier's lookups.
  await page.route(/open-meteo|thespacedevs|wikipedia\.org|wikimedia\.org|archive\.org|celestrak|dvidshub|photon\.komoot/, (r) => r.abort());
  await page.goto(app);
  await page.waitForFunction(() => window.__uap && document.getElementById('loading')?.classList.contains('done'), null, { timeout: 120_000 });
  console.log(`Rendering ${cases.length} cards from ${app}`);
  let done = 0;
  for (const c of cases) {
    const key = `case:${c.id}`;
    await page.evaluate((k) => window.__uap.select(k), key);
    // Wait for the camera to arrive and the imagery to finish loading.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const { viewer } = window.__uap;
          const start = performance.now();
          let last = null;
          let calm = 0;
          const tick = setInterval(() => {
            viewer.scene.requestRender();
            const p = viewer.camera.positionWC;
            const still = last && Math.abs(p.x - last.x) + Math.abs(p.y - last.y) + Math.abs(p.z - last.z) < 1;
            last = p.clone();
            calm = still && viewer.scene.globe.tilesLoaded ? calm + 1 : 0;
            if (calm >= 8 || performance.now() - start > 30_000) {
              clearInterval(tick);
              resolve();
            }
          }, 250);
        }),
    );
    const data = await page.evaluate(([k, url]) => window.__uap.cardFor(k, url), [key, `${SITE}case/${c.id}/`]);
    await writeFile(path.join(OUT, `${c.id}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    console.log(`${++done}/${cases.length} ${c.id}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
