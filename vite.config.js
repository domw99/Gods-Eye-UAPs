import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// `base` lets the same build run at a domain root or under a GitHub Pages
// project path (set BASE_PATH=/Gods-Eye-UAPs/ in CI).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [cesium()],
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
