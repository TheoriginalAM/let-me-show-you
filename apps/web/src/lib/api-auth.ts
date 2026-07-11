import 'server-only'

import { createHash, randomBytes } from 'crypto'
import { auth } from './auth'
import { resolveApiToken } from '../db/tokens'

const BEARER_PREFIX = 'Bearer '

/** SHA-256 of a token — what we store and compare (tokens are high-entropy). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** A fresh opaque bearer token for the desktop app. */
export function generateApiToken(): string {
  return `lmsy_${randomBytes(32).toString('base64url')}`
}

/**
 * The single auth entry point for /api/videos/* — resolves the user id from
 * EITHER a Bearer API token (desktop) OR a Better Auth session cookie (browser).
 * Returns null if neither is valid.
 */
export async function getAuthedUserId(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization')
  if (header?.startsWith(BEARER_PREFIX)) {
    const token = header.slice(BEARER_PREFIX.length).trim()
    if (token) {
      const userId = await resolveApiToken(hashToken(token))
      if (userId) return userId
    }
  }
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user.id ?? null
}
