import 'server-only'

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'

/**
 * Salted hash of the client IP for debouncing and rate limits. Returns null
 * (fail closed) rather than storing a weakly-salted hash when no salt is
 * configured in production.
 */
export async function clientIpHash(): Promise<string | null> {
  const salt = process.env.VIEW_IP_SALT
  if (!salt) {
    // A missing/blank salt would make the stored hashes trivially reversible
    // (IPv4 is only 2^32), so never persist under it in production.
    if (process.env.NODE_ENV === 'production') {
      console.error('[ip] VIEW_IP_SALT is not set, skipping IP hash')
      return null
    }
  }
  const h = await headers()
  const forwarded = h.get('x-forwarded-for') ?? ''
  // Use the RIGHTMOST forwarded hop (the address our trusted proxy, Railway,
  // appended), not the leftmost, which is attacker-supplied and spoofable.
  const hops = forwarded
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const ip = hops.length ? hops[hops.length - 1] : h.get('x-real-ip') || 'unknown'
  return createHash('sha256')
    .update(`${salt ?? 'lmsy-dev-salt'}:${ip}`)
    .digest('hex')
}
