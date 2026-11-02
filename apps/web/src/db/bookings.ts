import 'server-only'

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  lte,
  ne,
  sql,
  TransactionRollbackError,
} from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import {
  isSlotAvailable,
  isValidTimeZone,
  normalizeWeeklyHours,
  type BusyInterval,
  type SlotRules,
  type WeeklyHours,
} from '@/lib/booking-time'
import { pgErrorCode } from './errors'
import { db } from './index'
import { generateRoomSlug } from './meetings'
import {
  bookingEventTypes,
  bookingTimeOff,
  bookings,
  meetingRooms,
  user,
  workspaces,
} from './schema'
import { memberRole, type WorkspaceBrand } from './workspaces'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Executor = typeof db | Tx

const DAY_MS = 24 * 60 * 60 * 1000
const suffix = customAlphabet('abcdefghijkmnopqrstuvwxyz23456789', 4)

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

export const BOOKING_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/

/** "Acme Plumbing & Gas" → "acme-plumbing-gas". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 48)
    .replace(/-+$/, '')
}

/**
 * The workspace's public booking page slug, creating one from its brand (or
 * workspace) name the first time.
 */
export async function ensureBookingSlug(workspaceId: string): Promise<string> {
  const rows = await db
    .select({ slug: workspaces.bookingSlug, name: workspaces.name, brandName: workspaces.brandName })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  const ws = rows[0]
  if (!ws) throw new Error('workspace not found')
  if (ws.slug) return ws.slug
  const base = slugify(ws.brandName || ws.name) || 'book'
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 42)}-${suffix()}`
    try {
      const set = await db
        .update(workspaces)
        .set({ bookingSlug: candidate })
        .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.bookingSlug)))
        .returning({ slug: workspaces.bookingSlug })
      if (set[0]?.slug) return set[0].slug
      // Someone else set it meanwhile.
      const again = await db
        .select({ slug: workspaces.bookingSlug })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
      if (again[0]?.slug) return again[0].slug
    } catch (error) {
      if (pgErrorCode(error) !== '23505') throw error
    }
  }
  throw new Error('could not pick a booking slug')
}

/** Change the booking page address. Owner-only. */
export async function setBookingSlug(
  userId: string,
  workspaceId: string,
  slug: string,
): Promise<'ok' | 'invalid' | 'taken' | 'forbidden'> {
  if ((await memberRole(userId, workspaceId)) !== 'owner') return 'forbidden'
  const clean = slug.trim().toLowerCase()
  if (!BOOKING_SLUG_RE.test(clean)) return 'invalid'
  try {
    await db.update(workspaces).set({ bookingSlug: clean }).where(eq(workspaces.id, workspaceId))
    return 'ok'
  } catch (error) {
    if (pgErrorCode(error) === '23505') return 'taken'
    throw error
  }
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface EventTypeInput {
  title: string
  description: string | null
  durationMinutes: number
  slotStepMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  maxDaysAhead: number
  timeZone: string
  weeklyHours: WeeklyHours
  active: boolean
}

export interface EventTypeRecord extends EventTypeInput {
  id: string
  workspaceId: string
  hostUserId: string
  hostName: string
  slug: string
}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

/** Validate an event type from a form. */
export function cleanEventTypeInput(
  raw: Record<string, unknown>,
): { ok: true; value: EventTypeInput } | { ok: false; error: string } {
  const title = String(raw.title ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!title) return { ok: false, error: 'Give it a name.' }
  const description = String(raw.description ?? '').trim().slice(0, 1000) || null
  const durationMinutes = intIn(raw.durationMinutes, 5, 480)
  if (durationMinutes === null) return { ok: false, error: 'Length must be 5 minutes to 8 hours.' }
  const slotStepMinutes = intIn(raw.slotStepMinutes, 5, 240)
  if (slotStepMinutes === null) return { ok: false, error: 'Pick how often start times are offered.' }
  const bufferBeforeMinutes = intIn(raw.bufferBeforeMinutes, 0, 240)
  const bufferAfterMinutes = intIn(raw.bufferAfterMinutes, 0, 240)
  if (bufferBeforeMinutes === null || bufferAfterMinutes === null) {
    return { ok: false, error: 'Breaks between meetings can be up to 4 hours.' }
  }
  const minNoticeMinutes = intIn(raw.minNoticeMinutes, 0, 60 * 24 * 30)
  if (minNoticeMinutes === null) return { ok: false, error: 'Notice can be up to 30 days.' }
  const maxDaysAhead = intIn(raw.maxDaysAhead, 1, 365)
  if (maxDaysAhead === null) return { ok: false, error: 'Bookings can open 1 to 365 days ahead.' }
  const timeZone = String(raw.timeZone ?? '')
  if (!isValidTimeZone(timeZone)) return { ok: false, error: 'Pick a valid time zone.' }
  const weeklyHours = normalizeWeeklyHours(raw.weeklyHours)
  if (!weeklyHours) return { ok: false, error: 'Those hours look wrong.' }
  if (weeklyHours.every((d) => d.length === 0)) {
    return { ok: false, error: 'Add some available hours on at least one day.' }
  }
  return {
    ok: true,
    value: {
      title,
      description,
      durationMinutes,
      slotStepMinutes,
      bufferBeforeMinutes,
      bufferAfterMinutes,
      minNoticeMinutes,
      maxDaysAhead,
      timeZone,
      weeklyHours,
      active: Boolean(raw.active),
    },
  }
}

const eventTypeColumns = {
  id: bookingEventTypes.id,
  workspaceId: bookingEventTypes.workspaceId,
  hostUserId: bookingEventTypes.hostUserId,
  hostName: user.name,
  title: bookingEventTypes.title,
  slug: bookingEventTypes.slug,
  description: bookingEventTypes.description,
  durationMinutes: bookingEventTypes.durationMinutes,
  slotStepMinutes: bookingEventTypes.slotStepMinutes,
  bufferBeforeMinutes: bookingEventTypes.bufferBeforeMinutes,
  bufferAfterMinutes: bookingEventTypes.bufferAfterMinutes,
  minNoticeMinutes: bookingEventTypes.minNoticeMinutes,
  maxDaysAhead: bookingEventTypes.maxDaysAhead,
  timeZone: bookingEventTypes.timeZone,
  weeklyHours: bookingEventTypes.weeklyHours,
  active: bookingEventTypes.active,
}

export function slotRules(e: EventTypeInput): SlotRules {
  return {
    durationMinutes: e.durationMinutes,
    slotStepMinutes: e.slotStepMinutes,
    bufferBeforeMinutes: e.bufferBeforeMinutes,
    bufferAfterMinutes: e.bufferAfterMinutes,
    minNoticeMinutes: e.minNoticeMinutes,
    maxDaysAhead: e.maxDaysAhead,
    timeZone: e.timeZone,
    weeklyHours: e.weeklyHours,
  }
}

export async function listEventTypesForWorkspace(workspaceId: string): Promise<EventTypeRecord[]> {
  return db
    .select(eventTypeColumns)
    .from(bookingEventTypes)
    .innerJoin(user, eq(bookingEventTypes.hostUserId, user.id))
    .where(eq(bookingEventTypes.workspaceId, workspaceId))
    .orderBy(asc(bookingEventTypes.createdAt))
}

/** An event type any member of its workspace can manage, or null. */
export async function getEventTypeForMember(
  userId: string,
  eventTypeId: string,
): Promise<EventTypeRecord | null> {
  const rows = await db
    .select(eventTypeColumns)
    .from(bookingEventTypes)
    .innerJoin(user, eq(bookingEventTypes.hostUserId, user.id))
    .where(eq(bookingEventTypes.id, eventTypeId))
    .limit(1)
  const row = rows[0]
  if (!row || !(await memberRole(userId, row.workspaceId))) return null
  return row
}

/** Create an event type hosted by the caller. Null if they aren't a member. */
export async function createEventType(
  userId: string,
  workspaceId: string,
  input: EventTypeInput,
): Promise<{ id: string } | null> {
  if (!(await memberRole(userId, workspaceId))) return null
  const base = slugify(input.title) || 'meeting'
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? base : `${base.slice(0, 42)}-${suffix()}`
    try {
      const rows = await db
        .insert(bookingEventTypes)
        .values({ ...input, workspaceId, hostUserId: userId, slug })
        .returning({ id: bookingEventTypes.id })
      return rows[0]!
    } catch (error) {
      if (pgErrorCode(error) !== '23505') throw error
    }
  }
  throw new Error('could not pick an event slug')
}

/** Update an event type (any member of its workspace). The link (slug) stays put. */
export async function updateEventType(
  userId: string,
  eventTypeId: string,
  input: EventTypeInput,
): Promise<boolean> {
  if (!(await getEventTypeForMember(userId, eventTypeId))) return false
  await db.update(bookingEventTypes).set(input).where(eq(bookingEventTypes.id, eventTypeId))
  return true
}

/** Switch an event type on or off (off: its page stops taking bookings). */
export async function setEventTypeActive(
  userId: string,
  eventTypeId: string,
  active: boolean,
): Promise<boolean> {
  if (!(await getEventTypeForMember(userId, eventTypeId))) return false
  await db.update(bookingEventTypes).set({ active }).where(eq(bookingEventTypes.id, eventTypeId))
  return true
}

/** Delete an event type. Bookings already made stay (and keep their rooms). */
export async function deleteEventType(userId: string, eventTypeId: string): Promise<boolean> {
  if (!(await getEventTypeForMember(userId, eventTypeId))) return false
  await db.delete(bookingEventTypes).where(eq(bookingEventTypes.id, eventTypeId))
  return true
}

// ---------------------------------------------------------------------------
// Public booking pages
// ---------------------------------------------------------------------------

export interface PublicBusiness {
  workspaceId: string
  workspaceName: string
  slug: string
  brand: WorkspaceBrand
}

export interface PublicEventType extends EventTypeRecord {
  business: PublicBusiness
}

async function businessBySlug(slug: string): Promise<PublicBusiness | null> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.bookingSlug,
      brandName: workspaces.brandName,
      brandLogo: workspaces.brandLogo,
      brandColor: workspaces.brandColor,
      brandTagline: workspaces.brandTagline,
      brandLogoSize: workspaces.brandLogoSize,
      brandCtaLabel: workspaces.brandCtaLabel,
      brandCtaUrl: workspaces.brandCtaUrl,
    })
    .from(workspaces)
    .where(eq(workspaces.bookingSlug, slug))
    .limit(1)
  const w = rows[0]
  if (!w?.slug) return null
  return {
    workspaceId: w.id,
    workspaceName: w.name,
    slug: w.slug,
    brand: {
      name: w.brandName,
      logo: w.brandLogo,
      color: w.brandColor,
      tagline: w.brandTagline,
      logoSize: w.brandLogoSize,
      ctaLabel: w.brandCtaLabel,
      ctaUrl: w.brandCtaUrl,
    },
  }
}

/** A business's public booking page: its brand and the event types it offers. */
export async function getBookingPage(
  slug: string,
): Promise<{ business: PublicBusiness; eventTypes: EventTypeRecord[] } | null> {
  if (!BOOKING_SLUG_RE.test(slug)) return null
  const business = await businessBySlug(slug)
  if (!business) return null
  const eventTypes = (await listEventTypesForWorkspace(business.workspaceId)).filter((e) => e.active)
  return { business, eventTypes }
}

/** One bookable (active) event type by its public address. */
export async function getPublicEventType(
  businessSlug: string,
  eventSlug: string,
): Promise<PublicEventType | null> {
  if (!BOOKING_SLUG_RE.test(businessSlug) || !/^[a-z0-9-]{1,64}$/.test(eventSlug)) return null
  const business = await businessBySlug(businessSlug)
  if (!business) return null
  const rows = await db
    .select(eventTypeColumns)
    .from(bookingEventTypes)
    .innerJoin(user, eq(bookingEventTypes.hostUserId, user.id))
    .where(
      and(
        eq(bookingEventTypes.workspaceId, business.workspaceId),
        eq(bookingEventTypes.slug, eventSlug),
        eq(bookingEventTypes.active, true),
      ),
    )
    .limit(1)
  return rows[0] ? { ...rows[0], business } : null
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * When a host can't be booked between two instants: their confirmed bookings in
 * every workspace, plus time off. Pads the window a day each side so buffers
 * and long meetings near the edges still count.
 */
export async function hostBusy(
  hostUserId: string,
  from: number,
  to: number,
  opts: { exec?: Executor; ignoreBookingId?: string } = {},
): Promise<BusyInterval[]> {
  const exec = opts.exec ?? db
  const lo = new Date(from - DAY_MS).toISOString()
  const hi = new Date(to + DAY_MS).toISOString()
  const booked = await exec
    .select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.hostUserId, hostUserId),
        eq(bookings.status, 'confirmed'),
        lt(bookings.startsAt, hi),
        gt(bookings.endsAt, lo),
      ),
    )
  const away = await exec
    .select({ startsAt: bookingTimeOff.startsAt, endsAt: bookingTimeOff.endsAt })
    .from(bookingTimeOff)
    .where(
      and(
        eq(bookingTimeOff.userId, hostUserId),
        lt(bookingTimeOff.startsAt, hi),
        gt(bookingTimeOff.endsAt, lo),
      ),
    )
  return [
    ...booked
      .filter((b) => b.id !== opts.ignoreBookingId)
      .map((b) => ({ start: new Date(b.startsAt).getTime(), end: new Date(b.endsAt).getTime() })),
    ...away.map((a) => ({ start: new Date(a.startsAt).getTime(), end: new Date(a.endsAt).getTime() })),
  ]
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export function hashManageToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** How many bookings an IP made since a time (spam brake for the public form). */
export async function countRecentBookingsByIp(ipHash: string | null, since: Date): Promise<number> {
  if (!ipHash) return 0
  const rows = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.ipHash, ipHash), gte(bookings.createdAt, since.toISOString())))
  return Number(rows[0]?.n ?? 0)
}

export interface RescheduleFrom {
  id: string
  meetingRoomId: string | null
  icsUid: string
  icsSequence: number
}

/**
 * Book a time. Serialised per host (advisory lock) and re-checked against their
 * live calendar, so two guests can't take the same slot. Gives the booking its
 * own private meeting room (or keeps the old one when rescheduling, so the
 * link the guest already has still works).
 */
export async function createBooking(input: {
  event: PublicEventType
  startsAt: number
  guestName: string
  guestEmail: string
  guestNotes: string | null
  guestTimeZone: string | null
  ipHash: string | null
  reschedule?: RescheduleFrom
}): Promise<{ ok: true; id: string; token: string } | { ok: false; reason: 'taken' | 'gone' }> {
  const { event } = input
  const endsAt = input.startsAt + event.durationMinutes * 60_000
  const token = randomBytes(24).toString('base64url')

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking-host:${event.hostUserId}`}))`)
    const busy = await hostBusy(event.hostUserId, input.startsAt, endsAt, {
      exec: tx,
      ignoreBookingId: input.reschedule?.id,
    })
    if (!isSlotAvailable(slotRules(event), busy, input.startsAt, Date.now())) {
      return { ok: false as const, reason: 'taken' as const }
    }

    let roomId = input.reschedule?.meetingRoomId ?? null
    if (roomId) {
      const kept = await tx
        .select({ id: meetingRooms.id })
        .from(meetingRooms)
        .where(eq(meetingRooms.id, roomId))
        .limit(1)
      if (!kept[0]) roomId = null
    }
    for (let attempt = 0; !roomId && attempt < 5; attempt++) {
      const name = `${event.title} with ${input.guestName}`.replace(/\s+/g, ' ').slice(0, 80)
      const rows = await tx
        .insert(meetingRooms)
        .values({
          workspaceId: event.workspaceId,
          name,
          slug: generateRoomSlug(),
          lobbyEnabled: true,
          createdByUserId: event.hostUserId,
        })
        .onConflictDoNothing({ target: meetingRooms.slug })
        .returning({ id: meetingRooms.id })
      roomId = rows[0]?.id ?? null
    }
    if (!roomId) throw new Error('could not create a meeting room')

    const rows = await tx
      .insert(bookings)
      .values({
        workspaceId: event.workspaceId,
        eventTypeId: event.id,
        hostUserId: event.hostUserId,
        title: event.title,
        startsAt: new Date(input.startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestNotes: input.guestNotes,
        guestTimeZone: input.guestTimeZone,
        meetingRoomId: roomId,
        manageTokenHash: hashManageToken(token),
        icsUid: input.reschedule?.icsUid ?? `${randomUUID()}@letmeshowyou.com.au`,
        icsSequence: input.reschedule ? input.reschedule.icsSequence + 1 : 0,
        ipHash: input.ipHash,
      })
      .returning({ id: bookings.id })

    if (input.reschedule) {
      const moved = await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'guest',
          cancelReason: 'Rescheduled',
        })
        .where(and(eq(bookings.id, input.reschedule.id), eq(bookings.status, 'confirmed')))
        .returning({ id: bookings.id })
      // Cancelled (or moved) meanwhile: undo the new booking too.
      if (!moved[0]) tx.rollback()
    }
    return { ok: true as const, id: rows[0]!.id, token }
  }).catch((error) => {
    // tx.rollback() throws to abort; report it as the old booking being gone.
    if (error instanceof TransactionRollbackError) return { ok: false as const, reason: 'gone' as const }
    throw error
  })
}

export interface BookingDetail {
  id: string
  workspaceId: string
  title: string
  startsAt: string
  endsAt: string
  guestName: string
  guestEmail: string
  guestNotes: string | null
  guestTimeZone: string | null
  status: string
  cancelledBy: string | null
  cancelReason: string | null
  meetingRoomId: string | null
  roomSlug: string | null
  icsUid: string
  icsSequence: number
  hostUserId: string | null
  hostName: string | null
  hostEmail: string | null
  eventTypeId: string | null
  eventSlug: string | null
  eventTimeZone: string | null
  business: PublicBusiness
}

async function bookingDetail(where: ReturnType<typeof eq>): Promise<BookingDetail | null> {
  const rows = await db
    .select({
      id: bookings.id,
      workspaceId: bookings.workspaceId,
      title: bookings.title,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      guestNotes: bookings.guestNotes,
      guestTimeZone: bookings.guestTimeZone,
      status: bookings.status,
      cancelledBy: bookings.cancelledBy,
      cancelReason: bookings.cancelReason,
      meetingRoomId: bookings.meetingRoomId,
      roomSlug: meetingRooms.slug,
      icsUid: bookings.icsUid,
      icsSequence: bookings.icsSequence,
      hostUserId: bookings.hostUserId,
      hostName: user.name,
      hostEmail: user.email,
      eventTypeId: bookings.eventTypeId,
      eventSlug: bookingEventTypes.slug,
      eventTimeZone: bookingEventTypes.timeZone,
      workspaceName: workspaces.name,
      bookingSlug: workspaces.bookingSlug,
      brandName: workspaces.brandName,
      brandLogo: workspaces.brandLogo,
      brandColor: workspaces.brandColor,
      brandTagline: workspaces.brandTagline,
      brandLogoSize: workspaces.brandLogoSize,
      brandCtaLabel: workspaces.brandCtaLabel,
      brandCtaUrl: workspaces.brandCtaUrl,
    })
    .from(bookings)
    .innerJoin(workspaces, eq(bookings.workspaceId, workspaces.id))
    .leftJoin(meetingRooms, eq(bookings.meetingRoomId, meetingRooms.id))
    .leftJoin(user, eq(bookings.hostUserId, user.id))
    .leftJoin(bookingEventTypes, eq(bookings.eventTypeId, bookingEventTypes.id))
    .where(where)
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    title: r.title,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    guestName: r.guestName,
    guestEmail: r.guestEmail,
    guestNotes: r.guestNotes,
    guestTimeZone: r.guestTimeZone,
    status: r.status,
    cancelledBy: r.cancelledBy,
    cancelReason: r.cancelReason,
    meetingRoomId: r.meetingRoomId,
    roomSlug: r.roomSlug,
    icsUid: r.icsUid,
    icsSequence: r.icsSequence,
    hostUserId: r.hostUserId,
    hostName: r.hostName,
    hostEmail: r.hostEmail,
    eventTypeId: r.eventTypeId,
    eventSlug: r.eventSlug,
    eventTimeZone: r.eventTimeZone,
    business: {
      workspaceId: r.workspaceId,
      workspaceName: r.workspaceName,
      slug: r.bookingSlug ?? '',
      brand: {
        name: r.brandName,
        logo: r.brandLogo,
        color: r.brandColor,
        tagline: r.brandTagline,
        logoSize: r.brandLogoSize,
        ctaLabel: r.brandCtaLabel,
        ctaUrl: r.brandCtaUrl,
      },
    },
  }
}

export async function getBookingById(id: string): Promise<BookingDetail | null> {
  return bookingDetail(eq(bookings.id, id))
}

/** The booking behind a guest's manage link. */
export async function getBookingByToken(token: string): Promise<BookingDetail | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  return bookingDetail(eq(bookings.manageTokenHash, hashManageToken(token)))
}

/** A booking a member of its workspace can see and cancel. */
export async function getBookingForMember(
  userId: string,
  bookingId: string,
): Promise<BookingDetail | null> {
  const detail = await bookingDetail(eq(bookings.id, bookingId))
  if (!detail || !(await memberRole(userId, detail.workspaceId))) return null
  return detail
}

/**
 * Cancel a confirmed booking (compare-and-set), bumping the calendar sequence.
 * Returns the cancelled booking, or null if it wasn't confirmed any more.
 */
export async function cancelBooking(
  bookingId: string,
  by: 'guest' | 'host',
  reason: string | null,
): Promise<BookingDetail | null> {
  const rows = await db
    .update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: by,
      cancelReason: reason,
      icsSequence: sql`${bookings.icsSequence} + 1`,
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
    .returning({ id: bookings.id })
  if (!rows[0]) return null
  return getBookingById(bookingId)
}

/**
 * Delete a booking's meeting room once no confirmed booking uses it (the link
 * stops working). Returns whether it was deleted.
 */
export async function releaseBookingRoom(roomId: string): Promise<boolean> {
  const rows = await db
    .delete(meetingRooms)
    .where(
      and(
        eq(meetingRooms.id, roomId),
        sql`not exists (select 1 from ${bookings} where ${bookings.meetingRoomId} = ${meetingRooms.id} and ${bookings.status} = 'confirmed')`,
      ),
    )
    .returning({ id: meetingRooms.id })
  return rows.length > 0
}

export interface BookingListItem {
  id: string
  title: string
  startsAt: string
  endsAt: string
  guestName: string
  guestEmail: string
  guestNotes: string | null
  status: string
  cancelledBy: string | null
  cancelReason: string | null
  roomSlug: string | null
  hostName: string | null
}

/** A workspace's bookings: upcoming (soonest first) or past (latest first). */
export async function listBookingsForWorkspace(
  workspaceId: string,
  when: 'upcoming' | 'past',
  limit = 100,
): Promise<BookingListItem[]> {
  const now = new Date().toISOString()
  return db
    .select({
      id: bookings.id,
      title: bookings.title,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      guestName: bookings.guestName,
      guestEmail: bookings.guestEmail,
      guestNotes: bookings.guestNotes,
      status: bookings.status,
      cancelledBy: bookings.cancelledBy,
      cancelReason: bookings.cancelReason,
      roomSlug: meetingRooms.slug,
      hostName: user.name,
    })
    .from(bookings)
    .leftJoin(meetingRooms, eq(bookings.meetingRoomId, meetingRooms.id))
    .leftJoin(user, eq(bookings.hostUserId, user.id))
    .where(
      and(
        eq(bookings.workspaceId, workspaceId),
        when === 'upcoming' ? gt(bookings.endsAt, now) : lte(bookings.endsAt, now),
        // A reschedule leaves a cancelled twin behind: don't list it twice.
        ne(sql`coalesce(${bookings.cancelReason}, '')`, 'Rescheduled'),
      ),
    )
    .orderBy(when === 'upcoming' ? asc(bookings.startsAt) : desc(bookings.startsAt))
    .limit(limit)
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export interface TimeOffItem {
  id: string
  startsAt: string
  endsAt: string
  note: string | null
}

/** The user's current and upcoming time off. */
export async function listTimeOff(userId: string): Promise<TimeOffItem[]> {
  return db
    .select({
      id: bookingTimeOff.id,
      startsAt: bookingTimeOff.startsAt,
      endsAt: bookingTimeOff.endsAt,
      note: bookingTimeOff.note,
    })
    .from(bookingTimeOff)
    .where(and(eq(bookingTimeOff.userId, userId), gt(bookingTimeOff.endsAt, new Date().toISOString())))
    .orderBy(asc(bookingTimeOff.startsAt))
}

export async function addTimeOff(
  userId: string,
  startsAt: number,
  endsAt: number,
  note: string | null,
): Promise<void> {
  await db.insert(bookingTimeOff).values({
    userId,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    note,
  })
}

export async function removeTimeOff(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(bookingTimeOff)
    .where(and(eq(bookingTimeOff.id, id), eq(bookingTimeOff.userId, userId)))
    .returning({ id: bookingTimeOff.id })
  return rows.length > 0
}
