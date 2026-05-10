import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

const PROXY_TARGET = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'cektrans · TransPalu & Trans Donggala',
        short_name: 'cektrans',
        description: 'Pelacak realtime TransPalu dan Trans Donggala',
        theme_color: '#1D9CD4',
        background_color: '#F7F7F4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
  },
})
