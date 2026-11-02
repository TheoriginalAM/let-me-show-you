import 'server-only'

import { APP_DOMAIN } from '@lmsy/shared'
import { createNotifications } from '@/db/app-notifications'
import type { BookingDetail } from '@/db/bookings'
import { buildIcs, googleCalendarUrl, type IcsEvent } from './booking-ics'
import { formatDuration, formatWhen } from './booking-time'
import { sendEmail } from './email'
import { DEFAULT_ACCENT } from './brand-theme'
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingHostEmail,
  bookingReminderEmail,
  type EmailBrand,
} from './email-templates'

const BASE = `https://${APP_DOMAIN}`
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@letmeshowyou.com.au'

export function businessName(b: BookingDetail): string {
  return b.business.brand.name || b.business.workspaceName
}

/** The business's look for emails to its clients. */
function emailBrand(b: BookingDetail): EmailBrand {
  const { brand } = b.business
  return {
    name: businessName(b),
    logoUrl: brand.logoUrl ? `${BASE}${brand.logoUrl}` : null,
    accent: brand.color ?? DEFAULT_ACCENT,
    business: true,
  }
}

export function joinUrl(b: BookingDetail): string {
  return b.roomSlug ? `${BASE}/m/${b.roomSlug}` : BASE
}

export function rebookUrl(b: BookingDetail): string | null {
  return b.business.slug && b.eventSlug ? `${BASE}/book/${b.business.slug}/${b.eventSlug}` : null
}

function guestZone(b: BookingDetail): string {
  return b.guestTimeZone || b.eventTimeZone || 'Australia/Sydney'
}

function hostZone(b: BookingDetail): string {
  return b.eventTimeZone || guestZone(b)
}

function minutesLong(b: BookingDetail): number {
  return Math.round((new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 60_000)
}

/** The calendar invite for a booking (REQUEST to add or move it, CANCEL to remove it). */
export function bookingIcs(b: BookingDetail, method: IcsEvent['method']): string {
  return buildIcs({
    method,
    uid: b.icsUid,
    sequence: b.icsSequence,
    start: new Date(b.startsAt).getTime(),
    end: new Date(b.endsAt).getTime(),
    title: `${b.title} with ${businessName(b)}`,
    description: `Join the video call: ${joinUrl(b)}`,
    url: joinUrl(b),
    organizer: { name: businessName(b), email: FROM_EMAIL },
    attendee: { name: b.guestName, email: b.guestEmail },
  })
}

function icsAttachment(b: BookingDetail, method: IcsEvent['method']) {
  return {
    filename: 'invite.ics',
    type: `text/calendar; method=${method}`,
    content: bookingIcs(b, method),
  }
}

/**
 * Tell both sides about a new (or moved) booking: the guest gets the join and
 * manage links, the host an email plus an in-app notification. Best-effort.
 */
export async function announceBooking(
  b: BookingDetail,
  manageToken: string,
  previous: BookingDetail | null,
): Promise<void> {
  const start = new Date(b.startsAt).getTime()
  const end = new Date(b.endsAt).getTime()
  const name = businessName(b)
  const guest = bookingConfirmedEmail({
    guestName: b.guestName,
    businessName: name,
    title: b.title,
    when: formatWhen(start, guestZone(b), true),
    duration: formatDuration(minutesLong(b)),
    hostName: b.hostName,
    joinUrl: joinUrl(b),
    manageUrl: `${BASE}/booking/${manageToken}`,
    googleUrl: googleCalendarUrl({
      start,
      end,
      title: `${b.title} with ${name}`,
      description: `Join the video call: ${joinUrl(b)}`,
      url: joinUrl(b),
    }),
    rescheduled: Boolean(previous),
    message: b.confirmationMessage,
    brand: emailBrand(b),
  })
  const sends: Promise<unknown>[] = [
    sendEmail({
      to: b.guestEmail,
      ...guest,
      fromName: name,
      replyTo: b.hostEmail ? { email: b.hostEmail, name: b.hostName ?? name } : undefined,
      attachments: [icsAttachment(b, 'REQUEST')],
    }),
  ]
  if (b.hostEmail && b.hostUserId) {
    const when = formatWhen(start, hostZone(b), true)
    const host = bookingHostEmail({
      hostName: b.hostName ?? name,
      businessName: name,
      title: b.title,
      when,
      guestName: b.guestName,
      guestEmail: b.guestEmail,
      notes: b.guestNotes,
      answers: b.answers,
      previousWhen: previous
        ? formatWhen(new Date(previous.startsAt).getTime(), hostZone(b), true)
        : null,
      joinUrl: joinUrl(b),
      dashboardUrl: `${BASE}/dashboard/booking`,
    })
    sends.push(
      sendEmail({
        to: b.hostEmail,
        ...host,
        replyTo: { email: b.guestEmail, name: b.guestName },
        attachments: [icsAttachment(b, 'REQUEST')],
      }),
      createNotifications([b.hostUserId], {
        type: 'booking',
        title: previous ? `${b.guestName} moved their booking` : `New booking: ${b.guestName}`,
        body: `${b.title}, ${when}`,
        linkPath: '/dashboard/booking',
      }),
    )
  }
  const results = await Promise.allSettled(sends)
  for (const r of results)
    if (r.status === 'rejected') console.error('[booking] notify failed:', r.reason)
}

/** Tell both sides a booking was cancelled (the canceller gets a receipt). Best-effort. */
export async function announceCancellation(b: BookingDetail): Promise<void> {
  const start = new Date(b.startsAt).getTime()
  const name = businessName(b)
  const by = b.cancelledBy === 'host' ? b.hostName || name : b.guestName
  const sends: Promise<unknown>[] = [
    sendEmail({
      to: b.guestEmail,
      ...bookingCancelledEmail({
        recipientName: b.guestName,
        businessName: name,
        title: b.title,
        when: formatWhen(start, guestZone(b), true),
        cancelledBy: by,
        reason: b.cancelReason,
        rebookUrl: rebookUrl(b),
        brand: emailBrand(b),
      }),
      fromName: name,
      replyTo: b.hostEmail ? { email: b.hostEmail, name: b.hostName ?? name } : undefined,
      attachments: [icsAttachment(b, 'CANCEL')],
    }),
  ]
  // A host who cancelled already knows; a guest cancelling is news to them.
  if (b.cancelledBy === 'guest' && b.hostEmail && b.hostUserId) {
    const when = formatWhen(start, hostZone(b), true)
    sends.push(
      sendEmail({
        to: b.hostEmail,
        ...bookingCancelledEmail({
          recipientName: b.hostName ?? name,
          businessName: name,
          title: b.title,
          when,
          cancelledBy: by,
          reason: b.cancelReason,
          rebookUrl: null,
        }),
        replyTo: { email: b.guestEmail, name: b.guestName },
        attachments: [icsAttachment(b, 'CANCEL')],
      }),
      createNotifications([b.hostUserId], {
        type: 'booking',
        title: `${b.guestName} cancelled`,
        body: `${b.title}, ${when}`,
        linkPath: '/dashboard/booking',
      }),
    )
  }
  const results = await Promise.allSettled(sends)
  for (const r of results)
    if (r.status === 'rejected') console.error('[booking] notify failed:', r.reason)
}

/** Remind the guest their call is tomorrow, or in an hour. */
export async function sendBookingReminder(
  b: BookingDetail,
  soon: 'day' | 'hour',
): Promise<boolean> {
  const name = businessName(b)
  const email = bookingReminderEmail({
    guestName: b.guestName,
    businessName: name,
    title: b.title,
    when: formatWhen(new Date(b.startsAt).getTime(), guestZone(b), true),
    hostName: b.hostName,
    joinUrl: joinUrl(b),
    soon,
    brand: emailBrand(b),
  })
  return sendEmail({
    to: b.guestEmail,
    ...email,
    fromName: name,
    replyTo: b.hostEmail ? { email: b.hostEmail, name: b.hostName ?? name } : undefined,
  })
}
