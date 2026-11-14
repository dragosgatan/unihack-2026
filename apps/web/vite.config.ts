import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        // The 17 MB pose runtime and model are cached only on patient phones that need them, warmed by patient/pose/assets.ts.
        globIgnores: ['**/vision_wasm_internal-*'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(vision_wasm_internal|pose_landmarker_lite)-[^/]+$/,
            handler: 'CacheFirst',
            options: { cacheName: 'pose-assets' },
          },
        ],
      },
      manifest: {
        name: 'Tempo',
        short_name: 'Tempo',
        start_url: '/patient/home',
        scope: '/',
        display: 'standalone',
      },
    }),
  ],
  server: {
    port: 5173,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
