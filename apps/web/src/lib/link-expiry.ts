// Share-link expiry rules. No imports: used by the dashboard (browser), the
// share page and server actions, and the reminder sweep.

const DAY_MS = 24 * 60 * 60 * 1000

/** The quick choices offered in the dashboard ("In 7 days" …). */
export const EXPIRY_PRESET_DAYS = [7, 30, 90] as const
export type ExpiryPresetDays = (typeof EXPIRY_PRESET_DAYS)[number]

/** A link can be set to expire at most this far ahead. */
export const MAX_EXPIRY_DAYS = 2 * 365

/** The owner is emailed about this long before their link expires. */
export const EXPIRY_REMINDER_LEAD_MS = 3 * DAY_MS

/** Whether a link with this expiry has stopped working (null never expires). */
export function isLinkExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false
  const at = Date.parse(expiresAt)
  return Number.isFinite(at) && at <= now
}

/**
 * Check a requested expiry instant. Returns an error to show the person, or
 * null when it's in the future and no more than two years ahead. A day of slack
 * allows for "end of the chosen day" in any time zone.
 */
export function expiryProblem(at: number, now = Date.now()): string | null {
  if (!Number.isFinite(at)) return 'Pick a date for the link to expire.'
  if (at <= now) return 'Pick a date in the future.'
  if (at > now + (MAX_EXPIRY_DAYS + 1) * DAY_MS) return 'Pick a date within the next 2 years.'
  return null
}

/** "12 Dec 2026" in the reader's time zone (or the one given). */
export function formatExpiryDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso))
}
