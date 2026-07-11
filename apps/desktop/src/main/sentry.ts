import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'

/**
 * Initialise Sentry in the main process. Env-gated and off in development: only
 * runs for a packaged build with SENTRY_DSN set. The renderer's Sentry SDK
 * forwards its events through this main-process client (see main.tsx).
 */
export function initSentryMain(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn || !app.isPackaged) return
  Sentry.init({
    dsn,
    release: `lmsy-desktop@${app.getVersion()}`,
    // `||` not `??`: the build-time define bakes an empty string when unset.
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
  })
}
