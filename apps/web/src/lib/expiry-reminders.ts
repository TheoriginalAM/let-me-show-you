import 'server-only'

import { APP_DOMAIN, buildShareUrl } from '@lmsy/shared'
import {
  claimDueExpiryReminders,
  getExpiryReminderTarget,
  releaseExpiryReminderClaim,
} from '../db/video-expiry'
import { formatWhen } from './booking-time'
import { sendEmail } from './email'
import { linkExpiringEmail } from './email-templates'
import { EXPIRY_REMINDER_LEAD_MS } from './link-expiry'

const EVERY_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000
/** Owners don't have a time zone on file; the business is Australian. */
const EMAIL_TIME_ZONE = 'Australia/Sydney'

/**
 * Email each owner whose share link expires in about three days, once per
 * expiry date. Returns how many went out.
 */
export async function sendDueExpiryReminders(now = Date.now()): Promise<number> {
  const { ids, claimedAt } = await claimDueExpiryReminders(EXPIRY_REMINDER_LEAD_MS, now)
  let sent = 0
  for (const id of ids) {
    const target = await getExpiryReminderTarget(id)
    if (!target) continue
    const expiresAt = Date.parse(target.expiresAt)
    const { subject, html, text } = linkExpiringEmail({
      ownerName: target.ownerName,
      videoTitle: target.title,
      workspaceName: target.workspaceName,
      when: formatWhen(expiresAt, EMAIL_TIME_ZONE, true),
      daysLeft: expiresAt - now < DAY_MS ? 0 : Math.round((expiresAt - now) / DAY_MS),
      shareUrl: buildShareUrl(target.shareSlug),
      dashboardUrl: `https://${APP_DOMAIN}/dashboard`,
    })
    const ok = await sendEmail({ to: target.ownerEmail, subject, html, text }).catch(() => false)
    if (ok) sent++
    // A failed send (not just email being off, as in local dev) is retried next sweep.
    else if (process.env.SENDGRID_API_KEY) await releaseExpiryReminderClaim(id, claimedAt)
  }
  return sent
}

/**
 * Sweep for links about to expire every minute in this server process, next to
 * the booking reminders. Claims are atomic, so two processes can't double-send.
 */
export function startExpiryReminderLoop(): void {
  const g = globalThis as unknown as { __lmsyExpiryReminders?: NodeJS.Timeout }
  if (g.__lmsyExpiryReminders || process.env.DISABLE_EXPIRY_REMINDERS === '1') return
  const tick = (): void => {
    sendDueExpiryReminders()
      .then((n) => n > 0 && console.log(`[expiry-reminders] sent ${n}`))
      .catch((error) => console.error('[expiry-reminders] sweep failed:', error))
  }
  g.__lmsyExpiryReminders = setInterval(tick, EVERY_MS)
  g.__lmsyExpiryReminders.unref?.()
  setTimeout(tick, 20_000).unref?.()
}
