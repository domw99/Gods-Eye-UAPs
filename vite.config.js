import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { existsSync } from 'node:fs';
import { CASES } from './src/data/cases/index.js';
import { casePage, caseIndex, sitemap, siteStructuredData, ldJson } from './scripts/lib/case-pages.mjs';
import { openData } from './scripts/lib/open-data.mjs';
import { similarCases } from './src/data/similar.js';
import { RELEASE, SITE_URL } from './src/config.js';

// The public address, for link previews (they need absolute URLs).
const SITE = process.env.SITE_URL || SITE_URL;

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
    // The front page's structured data (the site, the app and the open data), with the current counts.
    {
      name: 'structured-data',
      transformIndexHtml: (html) =>
        html.replace('</head>', `  <script type="application/ld+json">${ldJson(siteStructuredData(CASES, { site: SITE }))}</script>\n</head>`),
    },
    // A page per case (case/<id>/) so a shared case link previews that case and
    // search engines can index it, an index of them all (case/), the case files
    // as open data (open-data/), and a sitemap listing the pages.
    {
      name: 'case-pages',
      apply: 'build',
      generateBundle() {
        const today = new Date().toISOString().slice(0, 10);
        const emit = (fileName, source) => this.emitFile({ type: 'asset', fileName, source });
        for (const c of CASES)
          emit(`case/${c.id}/index.html`, casePage(c, { site: SITE, card: existsSync(`public/cards/${c.id}.jpg`), similar: similarCases(c, CASES) }));
        emit('case/index.html', caseIndex(CASES, { site: SITE }));
        const data = openData(CASES, { site: SITE, version: RELEASE, date: today });
        emit('open-data/index.html', data.page);
        emit('open-data/cases.json', data.json);
        emit('open-data/cases.csv', data.csv);
        emit('open-data/cases.geojson', data.geojson);
        emit('sitemap.xml', sitemap(SITE, CASES.map((c) => c.id), today));
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
