'use server'

import { createHash } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import type { VideoStatus } from '@lmsy/shared'
import { SHARE_PATH } from '@lmsy/shared'
import { getShareableVideoBySlug, recordVideoView } from '@/db/queries'
import {
  signUnlockToken,
  unlockCookieName,
  verifySharePassword,
  verifyUnlockToken,
} from '@/lib/share-password'

/** How long an unlock cookie stays valid (7 days). */
const UNLOCK_MAX_AGE = 60 * 60 * 24 * 7

/**
 * True if the current request may view `video`: unprotected videos are always
 * viewable; protected ones require a valid unlock cookie for this exact
 * password hash. Keeps view-counting and status-polling honest for locked shares.
 */
async function isUnlocked(video: {
  id: string
  passwordHash: string | null
}): Promise<boolean> {
  if (!video.passwordHash) return true
  const token = (await cookies()).get(unlockCookieName(video.id))?.value
  return Boolean(token && verifyUnlockToken(token, video.id, video.passwordHash))
}

/**
 * Salted hash of the client IP for view debouncing. Returns null (fail closed)
 * rather than storing a weakly-salted hash when no salt is configured in prod.
 */
async function clientIpHash(): Promise<string | null> {
  const salt = process.env.VIEW_IP_SALT
  if (!salt) {
    // A missing/blank salt would make the stored hashes trivially reversible
    // (IPv4 is only 2^32), so never persist under it in production.
    if (process.env.NODE_ENV === 'production') {
      console.error('[views] VIEW_IP_SALT is not set — skipping view record')
      return null
    }
  }
  const h = await headers()
  const forwarded = h.get('x-forwarded-for') ?? ''
  // Use the RIGHTMOST forwarded hop — the address our trusted proxy (Railway)
  // appended — not the leftmost, which is attacker-supplied and spoofable.
  const hops = forwarded
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const ip = hops.length ? hops[hops.length - 1] : h.get('x-real-ip') || 'unknown'
  return createHash('sha256')
    .update(`${salt ?? 'lmsy-dev-salt'}:${ip}`)
    .digest('hex')
}

/**
 * Record a view for a share slug. Re-resolves the slug server-side (never trusts
 * a client-supplied id), only counts `ready` public videos, and is debounced to
 * one view per IP hash per hour inside the DAL.
 */
export async function recordShareView(slug: string): Promise<void> {
  const video = await getShareableVideoBySlug(slug)
  if (!video || video.status !== 'ready') return
  if (!(await isUnlocked(video))) return
  const ipHash = await clientIpHash()
  if (!ipHash) return
  await recordVideoView(video.id, ipHash)
}

/** Current status for a share slug, used by the "still processing" poller. */
export async function pollShareStatus(slug: string): Promise<VideoStatus | 'notfound'> {
  const video = await getShareableVideoBySlug(slug)
  // Don't leak a locked recording's status to someone who hasn't unlocked it.
  if (!video || !(await isUnlocked(video))) return 'notfound'
  return video.status
}

/**
 * Verify a share password and, on success, set an unlock cookie scoped to this
 * share's path. The cookie is bound to the current password hash, so it stops
 * working the instant the owner changes or clears the password.
 */
export async function unlockShare(slug: string, password: string): Promise<{ ok: boolean }> {
  const video = await getShareableVideoBySlug(slug)
  if (!video || !video.passwordHash) return { ok: false }
  if (!verifySharePassword(password, video.passwordHash)) return { ok: false }

  const cookieStore = await cookies()
  cookieStore.set(unlockCookieName(video.id), signUnlockToken(video.id, video.passwordHash), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/${SHARE_PATH}/${slug}`,
    maxAge: UNLOCK_MAX_AGE,
  })
  return { ok: true }
}
