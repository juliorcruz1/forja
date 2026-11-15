/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

// Shown in Ajustes ("Versión x.y.z"). In GitHub Actions the commit is included too.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const BUILD = (env.GITHUB_SHA ?? 'local').slice(0, 7);

// GitHub Pages serves the app from https://<user>.github.io/forja/
const BASE = '/forja/';

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(`${BUILD} · ${new Date().toISOString().slice(0, 10)}`),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FORJA',
        short_name: 'FORJA',
        description: 'Construir tu carácter mediante pequeñas acciones constantes.',
        lang: 'es',
        start_url: BASE,
        scope: BASE,
        id: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0D0D11',
        theme_color: '#0D0D11',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Spanish only needs the latin subsets of Inter
        globIgnores: ['**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*'],
        navigateFallback: `${BASE}index.html`,
        // New version takes over immediately instead of waiting for every tab to close
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
