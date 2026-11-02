'use server'

import {
  countRecentBookingsByIp,
  createBooking,
  getBookingById,
  getBookingByToken,
  getPublicEventType,
  hostBusy,
  slotRules,
  type BookingDetail,
} from '@/db/bookings'
import { announceBooking } from '@/lib/booking-emails'
import { cancelAndNotify } from '@/lib/booking-flow'
import { collectAnswers, type BookingAnswer } from '@/lib/booking-questions'
import { availableSlots, isValidTimeZone } from '@/lib/booking-time'
import { clientIpHash } from '@/lib/client-ip'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
/** Bookings allowed per IP per hour (offices share IPs). */
const RATE_MAX = 10
const RATE_WINDOW_MS = 60 * 60 * 1000
/** The most a guest's calendar asks for at once (a month view plus spill). */
const MAX_RANGE_MS = 45 * 24 * 60 * 60 * 1000

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max)
}

/** Open start times (ISO) for an event between two instants. */
export async function getSlots(
  businessSlug: string,
  eventSlug: string,
  fromIso: string,
  toIso: string,
  rescheduleToken?: string,
): Promise<{ ok: true; slots: string[] } | { ok: false; error: string }> {
  const event = await getPublicEventType(String(businessSlug), String(eventSlug))
  if (!event) return { ok: false, error: 'This booking link is no longer available.' }
  const from = Date.parse(String(fromIso))
  const to = Date.parse(String(toIso))
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > MAX_RANGE_MS) {
    return { ok: false, error: 'Bad date range.' }
  }
  // When moving a booking, its current time counts as free.
  const moving = rescheduleToken ? await reschedulable(String(rescheduleToken), event.id) : null
  const busy = await hostBusy(event.hostUserId, from, to, { ignoreBookingId: moving?.id })
  const slots = availableSlots(slotRules(event), busy, from, to, Date.now())
  return { ok: true, slots: slots.map((t) => new Date(t).toISOString()) }
}

/** A confirmed, not-yet-started booking of this event that the token can move. */
async function reschedulable(token: string, eventTypeId: string): Promise<BookingDetail | null> {
  const b = await getBookingByToken(token)
  if (!b || b.status !== 'confirmed' || b.eventTypeId !== eventTypeId) return null
  if (new Date(b.startsAt).getTime() <= Date.now()) return null
  return b
}

export type BookResult = { ok: true; token: string } | { ok: false; error: string; taken?: boolean }

/** Book a time (or move an existing booking to it when `rescheduleToken` is given). */
export async function bookSlot(
  businessSlug: string,
  eventSlug: string,
  input: {
    startsAt: string
    name: string
    email: string
    notes?: string
    timeZone?: string
    answers?: Record<string, string>
    rescheduleToken?: string
  },
): Promise<BookResult> {
  const event = await getPublicEventType(String(businessSlug), String(eventSlug))
  if (!event) return { ok: false, error: 'This booking link is no longer available.' }
  const startsAt = Date.parse(String(input.startsAt))
  if (!Number.isFinite(startsAt)) return { ok: false, error: 'Pick a time.' }
  const name = clean(input.name, 80)
  const email = clean(input.email, 254).toLowerCase()
  const notes =
    String(input.notes ?? '')
      .trim()
      .slice(0, 1000) || null
  const timeZone = isValidTimeZone(String(input.timeZone ?? '')) ? String(input.timeZone) : null
  if (!name) return { ok: false, error: 'Please add your name.' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please add a valid email.' }

  let previous: BookingDetail | null = null
  if (input.rescheduleToken) {
    previous = await reschedulable(String(input.rescheduleToken), event.id)
    if (!previous)
      return { ok: false, error: 'That booking can no longer be moved. Book a new time instead.' }
  }
  // A moved booking keeps the answers given the first time.
  let answers: BookingAnswer[] = previous?.answers ?? []
  if (!previous) {
    const checked = collectAnswers(event.questions, input.answers)
    if (!checked.ok) return { ok: false, error: checked.error }
    answers = checked.answers
  }

  const ipHash = await clientIpHash()
  if ((await countRecentBookingsByIp(ipHash, new Date(Date.now() - RATE_WINDOW_MS))) >= RATE_MAX) {
    return { ok: false, error: 'Too many bookings from your network. Please try again later.' }
  }

  const res = await createBooking({
    event,
    startsAt,
    guestName: name,
    guestEmail: email,
    guestNotes: notes,
    guestTimeZone: timeZone,
    answers,
    ipHash,
    reschedule: previous
      ? {
          id: previous.id,
          meetingRoomId: previous.meetingRoomId,
          icsUid: previous.icsUid,
          icsSequence: previous.icsSequence,
        }
      : undefined,
  })
  if (!res.ok) {
    return res.reason === 'taken'
      ? { ok: false, error: 'Sorry, that time was just taken. Please pick another.', taken: true }
      : { ok: false, error: 'That booking can no longer be moved. Book a new time instead.' }
  }
  const booking = await getBookingById(res.id)
  if (booking) await announceBooking(booking, res.token, previous)
  return { ok: true, token: res.token }
}

/** The guest cancels from their manage link. */
export async function cancelByGuest(
  token: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await getBookingByToken(String(token))
  if (!b) return { ok: false, error: 'Booking not found.' }
  if (b.status !== 'confirmed') return { ok: false, error: 'This booking is already cancelled.' }
  if (new Date(b.endsAt).getTime() <= Date.now())
    return { ok: false, error: 'This booking has already happened.' }
  const done = await cancelAndNotify(
    b.id,
    'guest',
    String(reason ?? '')
      .trim()
      .slice(0, 500) || null,
  )
  return done ? { ok: true } : { ok: false, error: 'This booking is already cancelled.' }
}
