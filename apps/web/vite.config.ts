import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

const PROXY_TARGET = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  // Read .env from the monorepo root so a single env file serves
  // both the Vite dev server and the Rust proxy.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-maskable.svg'],
      manifest: {
        name: 'cektrans · TransPalu & Trans Donggala',
        short_name: 'cektrans',
        description: 'Pelacak realtime TransPalu dan Trans Donggala',
        lang: 'id',
        theme_color: '#1D9CD4',
        background_color: '#F7F7F4',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['transit', 'travel', 'utilities'],
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/cities') && !url.pathname.includes('health'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'brt-routes',
              expiration: { maxAgeSeconds: 60 * 60 * 6 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: PROXY_TARGET, changeOrigin: true },
      '/socket.io': { target: PROXY_TARGET, changeOrigin: true, ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Split heavy third-party libs into their own long-lived chunks.
        // Leaflet + polyline rarely change so cache-busting only the
        // app chunk on each deploy saves repeat visitors a few hundred
        // KB of re-download. socket.io is similarly stable.
        manualChunks: {
          leaflet: ['leaflet', '@mapbox/polyline'],
          'vue-vendor': ['vue', 'vue-router', 'pinia', 'vue-i18n'],
          socket: ['socket.io-client'],
        },
      },
    },
  },
})
