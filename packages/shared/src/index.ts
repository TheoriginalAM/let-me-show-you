/**
 * Shared types and helpers for the "Let Me Show You" platform.
 *
 * This package is consumed as TypeScript source by both `apps/web`
 * (via Next's `transpilePackages`) and `apps/desktop` (bundled by
 * electron-vite / Vite). There is no build step — importers transpile it.
 */

export const APP_NAME = 'Let Me Show You'
export const APP_DOMAIN = 'letmeshowyou.com.au'

/** A registered account holder. */
export interface User {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  createdAt: string
}

/** Processing state of an uploaded screen recording. */
export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'failed'

/** A screen recording captured by the desktop app and hosted on the web app. */
export interface Video {
  id: string
  ownerId: string
  title: string
  description?: string
  status: VideoStatus
  durationSeconds: number
  sizeBytes: number
  width: number
  height: number
  thumbnailUrl?: string
  createdAt: string
  updatedAt: string
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

/** Build the public URL for a share link slug. */
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
