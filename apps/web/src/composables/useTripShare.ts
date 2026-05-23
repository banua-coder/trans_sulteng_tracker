/**
 * Renders RideShareCard offscreen, captures it to PNG via
 * html-to-image, then hands the file to the Web Share API. Falls
 * back to a direct download + clipboard-copy when the platform
 * doesn't support sharing files (Firefox + most desktop browsers).
 */
import { createApp, h, ref } from 'vue'
import { toPng } from 'html-to-image'
import { useShare } from '@vueuse/core'
import RideShareCard from '@/components/RideShareCard.vue'
import type { RideSummary } from '@/stores/ride'
import { buildShareText, buildShareUrl } from '@/lib/share'

export function useTripShare() {
  const share = useShare()
  const busy = ref(false)
  const lastError = ref<string | null>(null)

  async function shareTrip(summary: RideSummary): Promise<void> {
    busy.value = true
    lastError.value = null
    try {
      const blob = await renderCard(summary)
      if (!blob) throw new Error('render failed')
      const url = buildShareUrl({
        city: summary.city,
        origin: { lat: summary.trace[0]?.[0] ?? -0.9, lng: summary.trace[0]?.[1] ?? 119.85, label: summary.origin },
        destination: {
          lat: summary.trace[summary.trace.length - 1]?.[0] ?? -0.9,
          lng: summary.trace[summary.trace.length - 1]?.[1] ?? 119.85,
          label: summary.destination,
        },
        corridors: summary.corridors.map((c) => c.kor),
      })
      const text = buildShareText({
        city: summary.city,
        origin: summary.origin,
        destination: summary.destination,
        durationMin: summary.durationMin,
        corridors: summary.corridors.map((c) => c.kor),
        url,
      })

      const file = new File([blob], 'cektrans-trip.png', { type: 'image/png' })
      const payload = { title: 'cektrans', text, url, files: [file] }
      const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

      if (share.isSupported.value && canShareFiles) {
        await share.share(payload)
      } else if (share.isSupported.value) {
        await share.share({ title: 'cektrans', text, url })
        downloadBlob(blob, 'cektrans-trip.png')
      } else {
        downloadBlob(blob, 'cektrans-trip.png')
        try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : 'share failed'
    } finally {
      busy.value = false
    }
  }

  return { share: shareTrip, busy, lastError }
}

async function renderCard(summary: RideSummary): Promise<Blob | null> {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-99999px'
  host.style.top = '0'
  host.style.zIndex = '-1'
  document.body.appendChild(host)

  // The card is self-contained: no t() calls, no store access.
  // Mount it as a bare Vue app to avoid coupling to the parent
  // app's Pinia or i18n.
  const app = createApp({ render: () => h(RideShareCard, { summary }) })
  app.mount(host)

  try {
    // Leaflet needs ~600ms to lay out tiles inside the fixed
    // 1080px-wide container; shorter and we capture half-loaded tiles.
    await new Promise((r) => setTimeout(r, 700))
    const node = host.firstElementChild as HTMLElement | null
    if (!node) return null
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      fetchRequestInit: { mode: 'cors' },
    })
    return dataUrlToBlob(dataUrl)
  } finally {
    app.unmount()
    host.remove()
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',', 2)
  const meta = parts[0] ?? ''
  const b64 = parts[1] ?? ''
  const mimeMatch = /:(.*?);/.exec(meta)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
