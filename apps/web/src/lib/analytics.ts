/**
 * Google Analytics 4 loader. Loads gtag dynamically only when the
 * VITE_GA_ID env var is set so dev builds don't ship the script.
 *
 * No PII, no IP, no cross-site tracking — we send page_view + a short
 * list of UI events that help us understand which features get used
 * (corridor_focus, bus_follow, share_copy, geo_grant, city_switch).
 */

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const GA_ID = import.meta.env.VITE_GA_ID || ''

let loaded = false

export function initAnalytics(): void {
  if (loaded || !GA_ID || typeof window === 'undefined') return
  loaded = true

  window.dataLayer = window.dataLayer || []
  // Canonical gtag shape: push the real `arguments` object (not a
  // spread copy). GTM identifies gtag commands by checking
  // `arguments.callee === gtag`; a plain Array fails that check, so
  // commands sit in dataLayer un-processed and no /collect beacons
  // fire. Keep this verbatim — see https://developers.google.com/tag-platform/gtagjs/install
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID, {
    // Send page_view manually after route changes so SPA navigation
    // is captured properly.
    send_page_view: false,
    anonymize_ip: true,
  })

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.appendChild(s)
}

export function trackPageView(path: string, title?: string): void {
  if (!loaded || !window.gtag) return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: window.location.href,
  })
}

export function trackEvent(
  name: string,
  params: Record<string, string | number | boolean | undefined> = {},
): void {
  if (!loaded || !window.gtag) return
  window.gtag('event', name, params)
}
