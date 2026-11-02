'use server'

import { revalidatePath } from 'next/cache'
import {
  addTimeOff,
  cleanEventSlug,
  cleanEventTypeInput,
  createEventType,
  deleteEventType,
  getBookingForMember,
  removeTimeOff,
  setBookingSlug,
  setEventTypeActive,
  updateEventType,
} from '@/db/bookings'
import { getActiveWorkspaceId } from '@/db/workspaces'
import { cancelAndNotify } from '@/lib/booking-flow'
import { addDays, isValidTimeZone, zonedTimeToUtc } from '@/lib/booking-time'
import { getCurrentUser } from '@/lib/current-user'

type Result = { ok: true } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function me() {
  const user = await getCurrentUser()
  return user?.approved ? user : null
}

function done(): Result {
  revalidatePath('/dashboard/booking')
  return { ok: true }
}

export async function setBookingSlugAction(slug: string): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, error: 'No workspace.' }
  const res = await setBookingSlug(user.id, workspaceId, String(slug ?? ''))
  if (res === 'forbidden')
    return { ok: false, error: 'Only workspace owners can change the address.' }
  if (res === 'invalid') {
    return { ok: false, error: 'Use lowercase letters, numbers and dashes (up to 48).' }
  }
  if (res === 'taken') return { ok: false, error: 'That address is taken. Try another.' }
  revalidatePath('/dashboard', 'layout')
  return done()
}

/** Create (id null) or update an event type. */
export async function saveEventTypeAction(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const input = cleanEventTypeInput(raw ?? {})
  if (!input.ok) return input
  const slug = cleanEventSlug(raw?.slug)
  if (slug === 'invalid')
    return { ok: false, error: 'Links use lowercase letters, numbers and dashes (up to 48).' }
  const takenError = {
    ok: false as const,
    error: 'Another calendar in this business already uses that link.',
  }
  if (id) {
    if (!UUID_RE.test(String(id))) return { ok: false, error: 'Not found.' }
    const res = await updateEventType(user.id, String(id), input.value, slug)
    if (res === 'forbidden') return { ok: false, error: 'Not found.' }
    if (res === 'taken') return takenError
    return done()
  }
  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, error: 'No workspace.' }
  const res = await createEventType(user.id, workspaceId, input.value, slug)
  if (!res.ok)
    return res.reason === 'taken' ? takenError : { ok: false, error: 'Could not create it.' }
  return done()
}

export async function setEventTypeActiveAction(id: string, active: boolean): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (
    !UUID_RE.test(String(id)) ||
    !(await setEventTypeActive(user.id, String(id), Boolean(active)))
  ) {
    return { ok: false, error: 'Not found.' }
  }
  return done()
}

export async function deleteEventTypeAction(id: string): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (!UUID_RE.test(String(id)) || !(await deleteEventType(user.id, String(id)))) {
    return { ok: false, error: 'Not found.' }
  }
  return done()
}

/** A host cancels a booking: the guest is emailed (with a link to rebook). */
export async function cancelBookingAction(id: string, reason: string): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (!UUID_RE.test(String(id))) return { ok: false, error: 'Not found.' }
  const b = await getBookingForMember(user.id, String(id))
  if (!b) return { ok: false, error: 'Not found.' }
  if (b.status !== 'confirmed') return { ok: false, error: 'It’s already cancelled.' }
  const cancelled = await cancelAndNotify(
    b.id,
    'host',
    String(reason ?? '')
      .trim()
      .slice(0, 500) || null,
  )
  if (!cancelled) return { ok: false, error: 'It’s already cancelled.' }
  return done()
}

/** Block whole days (inclusive, in the given zone) across every workspace. */
export async function addTimeOffAction(
  fromDate: string,
  toDate: string,
  timeZone: string,
  note: string,
): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const from = String(fromDate ?? '')
  const to = String(toDate ?? '') || from
  const tz = String(timeZone ?? '')
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || !isValidTimeZone(tz)) {
    return { ok: false, error: 'Pick the dates.' }
  }
  if (to < from) return { ok: false, error: 'The last day is before the first.' }
  const startsAt = zonedTimeToUtc(from, 0, tz)
  const endsAt = zonedTimeToUtc(addDays(to, 1), 0, tz)
  if (startsAt === null || endsAt === null) return { ok: false, error: 'Pick the dates.' }
  if (endsAt - startsAt > 366 * 24 * 60 * 60 * 1000)
    return { ok: false, error: 'Up to a year at a time.' }
  await addTimeOff(
    user.id,
    startsAt,
    endsAt,
    String(note ?? '')
      .trim()
      .slice(0, 120) || null,
  )
  return done()
}

export async function removeTimeOffAction(id: string): Promise<Result> {
  const user = await me()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (!UUID_RE.test(String(id)) || !(await removeTimeOff(user.id, String(id)))) {
    return { ok: false, error: 'Not found.' }
  }
  return done()
}
