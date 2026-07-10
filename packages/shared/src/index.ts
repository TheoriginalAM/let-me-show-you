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
 * the owner id and any private/upload-only fields.
 */
export interface PublicVideo {
  id: string
  title: string
  status: VideoStatus
  muxPlaybackId: string | null
  durationSeconds: number | null
  shareSlug: string
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

/** Build the public URL for a share-link slug. */
export function buildShareUrl(slug: string): string {
  return `https://${APP_DOMAIN}/s/${slug}`
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
