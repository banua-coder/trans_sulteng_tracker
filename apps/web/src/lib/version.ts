/**
 * App version — surfaced in the UI (footer + map legend) so users
 * and bug reporters know which build they're looking at.
 *
 * Bump this manually when cutting a `cektrans/vX.Y.Z` tag. The build
 * SHA comes from CI (VITE_BUILD_SHA) and is shortened to 7 chars.
 */
export const APP_VERSION = "0.4.4"

export const BUILD_SHA: string =
  (import.meta.env.VITE_BUILD_SHA as string | undefined)?.slice(0, 7) ?? ''

/** Display string, e.g. "v0.1.3 · abc1234" (sha omitted in local dev). */
export const VERSION_LABEL = BUILD_SHA
  ? `v${APP_VERSION} · ${BUILD_SHA}`
  : `v${APP_VERSION}`
