import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { existsSync } from 'node:fs';
import { CASES } from './src/data/cases/index.js';
import { casePage, sitemap } from './scripts/lib/case-pages.mjs';

// The public address, for link previews (they need absolute URLs).
const SITE = process.env.SITE_URL || 'https://domw99.github.io/Gods-Eye-UAPs/';

// `base` lets the same build run at a domain root or under a GitHub Pages
// project path (set BASE_PATH=/Gods-Eye-UAPs/ in CI).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    cesium(),
    // Cesium.js is 6 MB: load it without blocking the page, so the loading
    // screen paints at once. Deferred scripts still run before the app module.
    {
      name: 'defer-cesium',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html) => html.replace(/<script src="([^"]*Cesium\.js)"><\/script>/, '<script defer src="$1"></script>'),
      },
    },
    // A page per case (case/<id>/) so a shared case link previews that case,
    // and a sitemap listing them.
    {
      name: 'case-pages',
      apply: 'build',
      generateBundle() {
        for (const c of CASES)
          this.emitFile({ type: 'asset', fileName: `case/${c.id}/index.html`, source: casePage(c, { site: SITE, card: existsSync(`public/cards/${c.id}.jpg`) }) });
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(SITE, CASES.map((c) => c.id), new Date().toISOString().slice(0, 10)) });
      },
    },
  ],
  server: { port: 5173, host: true },
  preview: { port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 5000 },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
