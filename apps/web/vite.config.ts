import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const PROXY_TARGET = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

/** maplibre-gl's worker script has a hardcoded `./maplibre-gl-shared.mjs`
 *  relative import baked into its source. Rollup's bundler hashes and
 *  relocates chunks, which breaks that hardcoded path — the worker then
 *  fails to load its dependency and the map hangs forever with a blank
 *  canvas (no console error, no tile requests). Emitting both files
 *  verbatim and unhashed, side by side, preserves the relative import so
 *  it resolves at runtime. Paired with setWorkerUrl() in leaflet/setup.ts,
 *  which is prod-only — dev resolves the same two files fine on its own
 *  since it serves maplibre-gl's real node_modules files directly (see
 *  optimizeDeps.exclude below). */
function maplibreWorkerAssets(): Plugin {
  const require = createRequire(import.meta.url)
  return {
    name: 'maplibre-worker-assets',
    apply: 'build',
    generateBundle() {
      for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: readFileSync(require.resolve(`maplibre-gl/dist/${name}`)),
        })
      }
    },
  }
}

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
    maplibreWorkerAssets(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // maplibre-gl resolves its worker script via `import.meta.url` at
    // runtime (relative to its own module file). Vite's esbuild dep
    // pre-bundling flattens it into node_modules/.vite/deps/, which
    // breaks that relative URL and 404s the worker — MapLibre then
    // hangs forever waiting on a worker handshake that never arrives
    // (no console error, no tile requests, blank basemap). Excluding
    // it serves the package's real files so the relative URL resolves
    // correctly.
    exclude: ['maplibre-gl'],
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
        // These rarely change so cache-busting only the app chunk on
        // each deploy saves repeat visitors re-downloading them.
        // leaflet + maplibre-gl-leaflet share a "leaflet" bucket: the
        // plugin imports leaflet directly, and every map-using route
        // now needs both together anyway (maplibre-gl is the WebGL
        // vector-tile renderer for the basemap), so splitting them
        // just relocates bytes rather than saving any — listing
        // leaflet alone left it as an empty near-0-byte chunk with
        // its real content pulled into the maplibre chunk regardless.
        manualChunks: {
          leaflet: ['leaflet', '@mapbox/polyline', '@maplibre/maplibre-gl-leaflet'],
          'vue-vendor': ['vue', 'vue-router', 'pinia', 'vue-i18n'],
          socket: ['socket.io-client'],
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
})
