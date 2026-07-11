import 'server-only'

import Mux from '@mux/mux-node'

let client: Mux | null = null

/** Lazily construct the Mux client so a missing key doesn't break `next build`. */
export function getMux(): Mux {
  if (client) return client
  const tokenId = process.env.MUX_TOKEN_ID
  const tokenSecret = process.env.MUX_TOKEN_SECRET
  if (!tokenId || !tokenSecret) {
    throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set')
  }
  client = new Mux({ tokenId, tokenSecret })
  return client
}

export function muxWebhookSecret(): string {
  const secret = process.env.MUX_WEBHOOK_SECRET
  if (!secret) throw new Error('MUX_WEBHOOK_SECRET must be set')
  return secret
}
