import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, magicLink } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
// Relative imports (not the `@/` alias) so the Better Auth CLI loader can
// resolve this module graph when generating the schema.
import { db } from '../db'
import * as schema from '../db/schema'
import { sendEmail } from './email'
import { magicLinkEmail } from './email-templates'
import { notifyAdminsOfSignup } from './notifications'

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
  // Email the admins when a new (pending) user is created. Best-effort — never
  // block or fail signup on a delivery hiccup.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Fire-and-forget: return immediately so signup isn't blocked on email.
          void notifyAdminsOfSignup(user).catch((error) =>
            console.error('[notify] admin signup alert failed:', error),
          )
        },
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Single-use login credential — deliver it, never log the URL in prod.
        const { subject, html, text } = magicLinkEmail(url)
        const ok = await sendEmail({ to: email, subject, html, text })
        if (!ok && process.env.NODE_ENV !== 'production') {
          console.log(`\n[magic-link] to: ${email}\n[magic-link] url: ${url}\n`)
        }
      },
    }),
    // Adds `role`/ban fields + admin APIs (list/set-role/ban/impersonate).
    // Bootstrap the first admin by setting their `user.role` to 'admin'.
    admin(),
    // nextCookies() must be the last plugin so it can attach Set-Cookie headers.
    nextCookies(),
  ],
})

export type Session = typeof auth.$Infer.Session
