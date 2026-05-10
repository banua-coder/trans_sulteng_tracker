/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

declare module 'leaflet-rotatedmarker'

import 'leaflet'
declare module 'leaflet' {
  interface MarkerOptions {
    rotationAngle?: number
    rotationOrigin?: string
  }
  interface Marker {
    setRotationAngle(angle: number): this
    setRotationOrigin(origin: string): this
  }
}

interface ImportMetaEnv {
  readonly VITE_PROXY_TARGET?: string
  readonly VITE_BUILD_SHA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
