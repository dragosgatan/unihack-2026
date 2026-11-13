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
      workbox: { globIgnores: ['**/*.wasm'] },
      manifest: {
        name: 'Tempo',
        short_name: 'Tempo',
        start_url: '/',
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
