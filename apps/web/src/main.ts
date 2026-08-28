import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'

import App from './App.vue'
import router from './router'
import { messages, type Locale } from './i18n'
import { initAnalytics, trackPageView } from './lib/analytics'

import './styles/global.css'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'

const stored = localStorage.getItem('cektrans:locale') as Locale | null
const initialLocale: Locale = stored ?? 'id'

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'id',
  messages,
})

// Pre-paint dark mode before Vue mounts so we don't flash light → dark.
// `useTheme()` handles ongoing toggling once the app is up.
{
  const mode = localStorage.getItem('cektrans:themeMode')
    ?? (localStorage.getItem('cektrans:theme') === 'dark' ? 'dark' : null)
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = mode === 'dark' || (mode == null && prefersDark) || (mode === 'system' && prefersDark)
  if (dark) document.documentElement.classList.add('dark')
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

initAnalytics()
router.afterEach((to) => {
  trackPageView(to.fullPath)
})

app.mount('#app')

// Fade out the inline splash defined in index.html. Wait one frame so
// the first paint has Vue content, then flag the document — the CSS
// transition handles the cross-fade and removes the splash from the
// pointer flow once it's invisible.
requestAnimationFrame(() => {
  document.documentElement.classList.add('app-ready')
})
