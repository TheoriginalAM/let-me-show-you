import 'server-only'

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Per-recording share passwords.
 *
 * A viewer proves knowledge of the password once; we then hand them an
 * HMAC "unlock token" cookie so they don't re-enter it on every visit. The
 * token is bound to BOTH the video id and the current password hash, so
 * changing or removing the password instantly invalidates every token that
 * was ever issued for it.
 *
 * The password itself is stored as a salted scrypt hash — never plaintext,
 * never reversible — in `videos.password_hash`.
 */

const SCRYPT_KEYLEN = 32

/** Salted scrypt hash of a share password. Format: `scrypt$<saltHex>$<hashHex>`. */
export function hashSharePassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password.normalize('NFKC'), salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** Constant-time check of a candidate password against a stored scrypt hash. */
export function verifySharePassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  if (salt.length === 0 || expected.length === 0) return false
  const actual = scryptSync(password.normalize('NFKC'), salt, expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Server secret for signing unlock tokens. Reuses the Better Auth secret. */
function unlockSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set — cannot sign unlock tokens')
  return secret
}

/**
 * An opaque unlock token for a specific video + password hash. Anyone holding
 * it has proven the password; it stops verifying the moment the owner changes
 * or clears the password (because `passwordHash` is part of the signed input).
 */
export function signUnlockToken(videoId: string, passwordHash: string): string {
  return createHmac('sha256', unlockSecret()).update(`${videoId}:${passwordHash}`).digest('hex')
}

/** Constant-time validation of an unlock token against the current password. */
export function verifyUnlockToken(token: string, videoId: string, passwordHash: string): boolean {
  const expected = signUnlockToken(videoId, passwordHash)
  const a = Buffer.from(token, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Cookie name that carries the unlock token for a given video. */
export function unlockCookieName(videoId: string): string {
  return `lmsy_unlock_${videoId}`
}
