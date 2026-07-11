/**
 * Shared types and helpers for the "Let Me Show You" platform.
 *
 * This package is consumed as TypeScript source by both `apps/web`
 * (via Next's `transpilePackages`) and `apps/desktop` (bundled by
 * electron-vite / Vite). There is no build step — importers transpile it.
 */

export const APP_NAME = 'Let Me Show You'
export const APP_DOMAIN = 'letmeshowyou.com.au'

/** A registered account holder (application-facing view of the auth user). */
export interface User {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  createdAt: string
}

/**
 * Processing state of an uploaded screen recording. This tuple is the single
 * source of truth — the web app's Drizzle `pgEnum` is built from it.
 */
export const VIDEO_STATUSES = ['uploading', 'processing', 'ready', 'errored'] as const

/** Processing state of an uploaded screen recording. */
export type VideoStatus = (typeof VIDEO_STATUSES)[number]

/**
 * A screen recording owned by a {@link User}. Mirrors the `videos` table
 * (minus server-only columns such as `password_hash`). Dates are ISO strings.
 */
export interface Video {
  id: string
  ownerId: string
  title: string
  status: VideoStatus
  muxAssetId: string | null
  muxPlaybackId: string | null
  durationSeconds: number | null
  shareSlug: string
  isPublic: boolean
  createdAt: string
}

/**
 * The public-safe view of a {@link Video}, returned for share links. Excludes
 * the owner id and any private/upload-only fields, but includes the owner's
 * display name and creation date, which are shown on the public share page.
 */
export interface PublicVideo {
  id: string
  title: string
  status: VideoStatus
  muxPlaybackId: string | null
  durationSeconds: number | null
  shareSlug: string
  /** Owner's display name (public byline on the share page). */
  ownerName: string
  /** ISO creation date, shown as a relative time on the share page. */
  createdAt: string
}

/** A single view event against a {@link Video} (basic analytics). */
export interface VideoView {
  id: string
  videoId: string
  viewedAt: string
  viewerIpHash: string | null
}

/** Who is allowed to open a share link. */
export type ShareVisibility = 'public' | 'unlisted' | 'private'

/** A shareable link to a {@link Video}. */
export interface ShareLink {
  id: string
  videoId: string
  slug: string
  visibility: ShareVisibility
  expiresAt?: string
  createdAt: string
}

/** The path segment public share links live under (`/v/<slug>`). */
export const SHARE_PATH = 'v'

/** Build the public URL for a share-link slug (`https://<domain>/v/<slug>`). */
export function buildShareUrl(slug: string): string {
  return `https://${APP_DOMAIN}/${SHARE_PATH}/${slug}`
}

/**
 * Build a Mux image URL for a playback id. Works for any public playback id and
 * needs no auth. Defaults to a webp thumbnail; pass `time`/`width`/`height` to
 * pick a frame and size. Used for posters and dashboard/OpenGraph images.
 */
export function muxThumbnailUrl(
  playbackId: string,
  opts: {
    time?: number
    width?: number
    height?: number
    fitMode?: 'preserve' | 'crop' | 'smartcrop' | 'pad'
    /** Image format. Default `webp`; use `jpg` for social cards (LinkedIn etc. don't render webp). */
    format?: 'webp' | 'jpg' | 'png'
  } = {},
): string {
  // Built by hand (no URLSearchParams) so this stays lib-agnostic for the
  // desktop bundle; all values are numbers or a fixed enum, so no encoding.
  const params: string[] = []
  if (opts.time != null) params.push(`time=${opts.time}`)
  if (opts.width) params.push(`width=${opts.width}`)
  if (opts.height) params.push(`height=${opts.height}`)
  if (opts.fitMode) params.push(`fit_mode=${opts.fitMode}`)
  const qs = params.length ? `?${params.join('&')}` : ''
  return `https://image.mux.com/${playbackId}/thumbnail.${opts.format ?? 'webp'}${qs}`
}

/** Human-readable relative time (e.g. `just now`, `3 hours ago`, `2 days ago`). */
export function formatRelativeDate(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.round((now - then) / 1000)
  if (seconds < 45) return 'just now'
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.348, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ]
  let value = seconds
  let unit = 'second'
  for (let i = 0; i < units.length; i++) {
    unit = units[i][1]
    if (value < units[i][0]) break
    value = value / units[i][0]
  }
  const rounded = Math.floor(value)
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`
}

/** Human-readable rendering of a byte count (e.g. `12.4 MB`). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

/** Human-readable duration (e.g. `1:32`) from a whole number of seconds. */
export function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds < 0) return '0:00'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// HTTP API contract between apps/web and apps/desktop.
// ---------------------------------------------------------------------------

/** Body for `POST /api/videos/create-upload`. */
export interface CreateUploadRequest {
  title?: string
}

/** Response from `POST /api/videos/create-upload`. */
export interface CreateUploadResponse {
  videoId: string
  /** Mux direct-upload URL to PUT the file to. */
  uploadUrl: string
  /** Public share URL (`https://<domain>/v/<slug>`). */
  shareUrl: string
}

/** Response from `POST /api/auth/device/start`. */
export interface DeviceStartResponse {
  /** Secret the desktop polls with (never shown to the user). */
  deviceCode: string
  /** Short human code the user confirms in the browser. */
  userCode: string
  /** Page where the user approves (`https://<domain>/device`). */
  verificationUri: string
  /** Same page with the code prefilled. */
  verificationUriComplete: string
  /** Seconds the desktop should wait between polls. */
  intervalSeconds: number
  /** Seconds until the device code expires. */
  expiresInSeconds: number
}

/** Body for `POST /api/auth/device/approve` (browser, session-authed). */
export interface DeviceApproveRequest {
  userCode: string
}

/** Response from `POST /api/auth/device/poll`. */
export type DevicePollResponse = { status: 'pending' } | { status: 'approved'; token: string }

/** Standard JSON error body. */
export interface ApiErrorResponse {
  error: string
}
