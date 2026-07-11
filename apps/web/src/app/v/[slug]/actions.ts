'use server'

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import type { VideoStatus } from '@lmsy/shared'
import { getVideoBySlug, recordVideoView } from '@/db/queries'

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
  const video = await getVideoBySlug(slug)
  if (!video || video.status !== 'ready') return
  const ipHash = await clientIpHash()
  if (!ipHash) return
  await recordVideoView(video.id, ipHash)
}

/** Current status for a share slug, used by the "still processing" poller. */
export async function pollShareStatus(slug: string): Promise<VideoStatus | 'notfound'> {
  const video = await getVideoBySlug(slug)
  return video?.status ?? 'notfound'
}
