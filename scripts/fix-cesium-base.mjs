#!/usr/bin/env node
/**
 * vite-plugin-cesium copies Cesium's static files to `<outDir>/<base>/cesium`
 * while the page loads them from `<base>/cesium`. At a domain root the two
 * agree, but under a sub-path (GitHub Pages: /Gods-Eye-UAPs/) the files end up
 * one folder too deep and the globe fails to load. Move them up.
 *
 *   node scripts/fix-cesium-base.mjs [outDir]
 */
import { existsSync } from 'node:fs';
import { rename, rm, readdir } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] || 'dist');
const base = (process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '');
if (!base) process.exit(0);

const nested = path.join(outDir, base, 'cesium');
const target = path.join(outDir, 'cesium');
if (!existsSync(nested)) {
  if (!existsSync(target)) {
    console.error(`Cesium assets not found in ${nested} or ${target}`);
    process.exit(1);
  }
  process.exit(0);
}
await rm(target, { recursive: true, force: true });
await rename(nested, target);
// Remove the now-empty <base> folder chain.
let dir = path.join(outDir, base);
while (dir.startsWith(outDir) && dir !== outDir && (await readdir(dir)).length === 0) {
  await rm(dir, { recursive: true });
  dir = path.dirname(dir);
}
console.log(`Moved Cesium assets to ${path.relative(process.cwd(), target)}`);
