import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'

import App from './App.vue'
import router from './router'
import { messages, type Locale } from './i18n'
import { initAnalytics, trackPageView } from './lib/analytics'

import './styles/global.css'
import 'leaflet/dist/leaflet.css'

const stored = localStorage.getItem('cektrans:locale') as Locale | null
const initialLocale: Locale = stored ?? 'id'

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'id',
  messages,
})

// Pre-paint dark mode before Vue mounts so we don't flash light → dark.
// `useTheme` (VueUse useDark) handles ongoing toggling once the app is up.
if (localStorage.getItem('cektrans:theme') === 'dark') {
  document.documentElement.classList.add('dark')
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
