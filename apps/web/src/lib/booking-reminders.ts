import 'server-only'

import { claimDueReminders, getBookingById, releaseReminderClaim } from '@/db/bookings'
import { sendBookingReminder } from './booking-emails'

const EVERY_MS = 60_000

/** Send any reminders that are due. Returns how many went out. */
export async function sendDueReminders(now = Date.now()): Promise<number> {
  let sent = 0
  for (const kind of ['day', 'hour'] as const) {
    const { ids, claimedAt } = await claimDueReminders(kind, now)
    for (const id of ids) {
      const booking = await getBookingById(id)
      if (!booking || booking.status !== 'confirmed') continue
      const ok = await sendBookingReminder(booking, kind).catch(() => false)
      if (ok) sent++
      // A failed send (not just email being off, as in local dev) is retried next sweep.
      else if (process.env.SENDGRID_API_KEY) await releaseReminderClaim(kind, id, claimedAt)
    }
  }
  return sent
}

/**
 * Sweep for due reminders every minute in this server process. Claims are
 * atomic, so a second process (or a restart mid-sweep) can't double-send.
 */
export function startReminderLoop(): void {
  const g = globalThis as unknown as { __lmsyReminders?: NodeJS.Timeout }
  if (g.__lmsyReminders || process.env.DISABLE_BOOKING_REMINDERS === '1') return
  const tick = (): void => {
    sendDueReminders()
      .then((n) => n > 0 && console.log(`[reminders] sent ${n}`))
      .catch((error) => console.error('[reminders] sweep failed:', error))
  }
  g.__lmsyReminders = setInterval(tick, EVERY_MS)
  g.__lmsyReminders.unref?.()
  setTimeout(tick, 15_000).unref?.()
}
