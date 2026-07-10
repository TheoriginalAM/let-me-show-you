import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
// Relative imports (not the `@/` alias) so the Better Auth CLI loader can
// resolve this module graph when generating the schema.
import { db } from '../db'
import * as schema from '../db/schema'

// Pin the origin explicitly. Without this, Better Auth would derive the base URL
// (used to build magic-link URLs and to validate CSRF origins) from the incoming
// request Host header — a spoofable, host-poisoning vector for magic links.
const baseURL = process.env.BETTER_AUTH_URL
if (!baseURL && process.env.NODE_ENV === 'production') {
  throw new Error('BETTER_AUTH_URL must be set in production')
}

export const auth = betterAuth({
  baseURL,
  trustedOrigins: baseURL ? [new URL(baseURL).origin] : [],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // TODO: wire up Resend for real delivery. Never log the token-bearing
        // URL in production — it is a single-use login credential.
        if (process.env.NODE_ENV === 'production') {
          console.warn(`[magic-link] email delivery not configured; link for ${email} not sent`)
          return
        }
        console.log(`\n[magic-link] to: ${email}\n[magic-link] url: ${url}\n`)
      },
    }),
    // nextCookies() must be the last plugin so it can attach Set-Cookie headers.
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
