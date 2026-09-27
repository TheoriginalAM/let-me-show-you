'use server'

import { APP_DOMAIN } from '@lmsy/shared'
import { createNotifications, ownerIdsForWorkspace } from '@/db/app-notifications'
import {
  applyRoomLobby,
  cancelPendingKnock,
  countRecentKnocksByIp,
  createKnock,
  decideKnock,
  denyIdentity,
  expireKnock,
  findLatestKnock,
  getRoomBySlug,
  knockIsPresent,
  listPendingKnocks,
  roomLobbyEnabled,
  touchKnock,
  type LobbyGuest,
  type PublicMeetingRoom,
} from '@/db/meetings'
import { memberRole } from '@/db/workspaces'
import { clientIpHash } from '@/lib/client-ip'
import { getCurrentUser, type CurrentUser } from '@/lib/current-user'
import {
  createJoinToken,
  guestIdentity,
  liveRoomStartedAt,
  livekitRoomName,
  meetingsConfigured,
  memberIdentity,
  roomService,
  signalRoom,
  type MeetingRole,
} from '@/lib/livekit'
import { startMeetingRecording, stopMeetingRecording } from '@/lib/meeting-recording'
import { notifyMeetingInvite } from '@/lib/notifications'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NAME = 60
/** Join/knock attempts allowed per IP per room in the window (offices share IPs). */
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX = 30
const MAX_INVITES = 10

export type JoinResult =
  | { status: 'joined'; token: string; serverUrl: string; role: MeetingRole }
  | { status: 'waiting' }
  | { status: 'denied' }
  | { status: 'none' }
  | { status: 'error'; error: string }

type Ok = { ok: true } | { ok: false; error: string }

function cleanName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME)
}

function cleanEmail(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 200)
}

/** The signed-in caller if they may host this room (an approved member of its workspace). */
async function hostFor(room: PublicMeetingRoom): Promise<CurrentUser | null> {
  const me = await getCurrentUser()
  if (!me || !me.approved) return null
  return (await memberRole(me.id, room.workspaceId)) ? me : null
}

async function hostContext(
  slug: string,
): Promise<{ room: PublicMeetingRoom; me: CurrentUser } | null> {
  if (!meetingsConfigured()) return null
  const room = await getRoomBySlug(String(slug))
  if (!room) return null
  const me = await hostFor(room)
  return me ? { room, me } : null
}

/** Grace after an admission during which it always counts (covers the join itself). */
const ADMIT_GRACE_MS = 2 * 60 * 1000

/**
 * An admission only counts for the meeting it was given in. The LiveKit room
 * exists only while occupied, so if the live session began after the host said
 * yes, this is a new meeting and the guest must ask again. 'unknown' means
 * LiveKit couldn't be reached: don't revoke anything on a transient error.
 */
async function admissionIsCurrent(
  roomId: string,
  decidedAt: string | null,
): Promise<'yes' | 'no' | 'unknown'> {
  if (!decidedAt) return 'no'
  const decided = new Date(decidedAt).getTime()
  if (Date.now() - decided < ADMIT_GRACE_MS) return 'yes'
  const started = await liveRoomStartedAt(roomId)
  if (started === 'unknown') return 'unknown'
  return started !== 'none' && started <= decided ? 'yes' : 'no'
}

/**
 * Retire a stale admission. If it changed meanwhile (a host just removed them),
 * report the new state instead of overwriting it.
 */
async function retireAdmission(
  roomId: string,
  identity: string,
  knockId: string,
): Promise<'retired' | 'denied'> {
  if (await expireKnock(knockId)) return 'retired'
  const now = await findLatestKnock(roomId, identity)
  return now?.status === 'denied' ? 'denied' : 'retired'
}

async function guestToken(roomId: string, identity: string, name: string): Promise<JoinResult> {
  return {
    status: 'joined',
    role: 'guest',
    ...(await createJoinToken({ roomId, identity, name, role: 'guest' })),
  }
}

/** If no host is in the call, leave an in-app note that someone is waiting. */
async function notifyIfNoHost(room: PublicMeetingRoom, guestName: string): Promise<void> {
  try {
    let hostPresent = false
    try {
      const participants = await roomService().listParticipants(livekitRoomName(room.id))
      hostPresent = participants.some((p) => p.identity.startsWith('u_'))
    } catch {
      // The LiveKit room doesn't exist until someone joins: nobody is there.
    }
    if (hostPresent) return
    const creatorIsMember =
      room.createdByUserId && (await memberRole(room.createdByUserId, room.workspaceId))
    const recipients = creatorIsMember
      ? [room.createdByUserId as string]
      : await ownerIdsForWorkspace(room.workspaceId)
    await createNotifications(recipients, {
      type: 'meeting_knock',
      title: `${guestName} is waiting in ${room.name}`,
      body: 'Open the room to let them in.',
      linkPath: `/m/${room.slug}`,
    })
  } catch (error) {
    console.error('[meeting] waiting notification failed:', error)
  }
}

/**
 * Ask to join a room. Approved workspace members join straight away as hosts.
 * Guests give a name + email; with the lobby on they wait for a host, otherwise
 * they're let in. `guestKey` is a random secret kept in the guest's browser.
 */
export async function requestJoin(
  slug: string,
  input: { name: string; email: string; guestKey: string; website?: string },
): Promise<JoinResult> {
  if (!meetingsConfigured()) return { status: 'error', error: 'Meetings are not set up yet.' }
  // Honeypot: real people never fill the hidden "website" field.
  if (input.website != null && String(input.website).trim() !== '') {
    return { status: 'error', error: 'Unable to join this meeting.' }
  }
  const room = await getRoomBySlug(String(slug))
  if (!room) return { status: 'error', error: 'This meeting link is not valid.' }

  const host = await hostFor(room)
  if (host) {
    const name = cleanName(input.name) || host.name
    return {
      status: 'joined',
      role: 'host',
      ...(await createJoinToken({
        roomId: room.id,
        identity: memberIdentity(host.id),
        name,
        role: 'host',
      })),
    }
  }

  const name = cleanName(input.name)
  const email = cleanEmail(input.email)
  if (!name) return { status: 'error', error: 'Please add your name.' }
  if (!EMAIL_RE.test(email)) return { status: 'error', error: 'Please add a valid email.' }
  const identity = guestIdentity(room.id, String(input.guestKey ?? ''))
  if (!identity) return { status: 'error', error: 'Please refresh the page and try again.' }

  const existing = await findLatestKnock(room.id, identity)
  if (existing?.status === 'denied') return { status: 'denied' }
  if (existing?.status === 'admitted') {
    const current = await admissionIsCurrent(room.id, existing.decidedAt)
    if (current === 'yes') return guestToken(room.id, identity, existing.name)
    if (current === 'unknown') {
      return { status: 'error', error: 'Could not reach the meeting. Please try again.' }
    }
    // Admitted to an earlier meeting in this room: that doesn't carry over.
    if ((await retireAdmission(room.id, identity, existing.id)) === 'denied') {
      return { status: 'denied' }
    }
  } else if (existing?.status === 'pending') {
    if (!(await roomLobbyEnabled(room.id))) {
      // The host turned the lobby off while they waited: let them in.
      if (await decideKnock(room.id, existing.id, 'admitted')) {
        return guestToken(room.id, identity, existing.name)
      }
      return { status: 'waiting' }
    }
    if (knockIsPresent(existing)) {
      await touchKnock(existing.id)
      return { status: 'waiting' }
    }
    // They'd left (closed the tab). Withdraw the old request and make a fresh
    // one below, so re-announcing them goes through the per-IP rate limit.
    await cancelPendingKnock(room.id, identity)
  }

  const ipHash = await clientIpHash()
  const since = new Date(Date.now() - RATE_WINDOW_MS)
  if ((await countRecentKnocksByIp(room.id, ipHash, since)) >= RATE_MAX) {
    return { status: 'error', error: 'Too many attempts. Please wait a few minutes.' }
  }

  // Re-read the lobby flag right before letting anyone straight in, in case a
  // host just turned it on (e.g. by removing someone).
  if (!(await roomLobbyEnabled(room.id))) {
    await createKnock({ roomId: room.id, identity, name, email, ipHash, status: 'admitted' })
    return guestToken(room.id, identity, name)
  }
  await createKnock({ roomId: room.id, identity, name, email, ipHash, status: 'pending' })
  await signalRoom(room.id, 'lobby', { type: 'knock' })
  await notifyIfNoHost(room, name)
  return { status: 'waiting' }
}

/** A waiting guest polls this until a host lets them in (or declines). */
export async function checkJoin(slug: string, guestKey: string): Promise<JoinResult> {
  if (!meetingsConfigured()) return { status: 'error', error: 'Meetings are not set up yet.' }
  const room = await getRoomBySlug(String(slug))
  if (!room) return { status: 'error', error: 'This meeting link is not valid.' }
  const identity = guestIdentity(room.id, String(guestKey ?? ''))
  if (!identity) return { status: 'none' }
  const knock = await findLatestKnock(room.id, identity)
  if (!knock || knock.status === 'cancelled' || knock.status === 'expired') {
    return { status: 'none' }
  }
  if (knock.status === 'denied') return { status: 'denied' }
  if (knock.status === 'admitted') {
    const current = await admissionIsCurrent(room.id, knock.decidedAt)
    if (current === 'yes') return guestToken(room.id, identity, knock.name)
    // Can't reach LiveKit right now: keep polling rather than revoking.
    if (current === 'unknown') return { status: 'waiting' }
    return (await retireAdmission(room.id, identity, knock.id)) === 'denied'
      ? { status: 'denied' }
      : { status: 'none' }
  }
  if (!room.lobbyEnabled && !(await roomLobbyEnabled(room.id))) {
    if (await decideKnock(room.id, knock.id, 'admitted')) {
      return guestToken(room.id, identity, knock.name)
    }
    return { status: 'waiting' }
  }
  // Still waiting: record that they're here so hosts keep seeing them.
  await touchKnock(knock.id)
  return { status: 'waiting' }
}

/** A guest leaves the lobby before being let in. */
export async function cancelKnock(slug: string, guestKey: string): Promise<void> {
  if (!meetingsConfigured()) return
  const room = await getRoomBySlug(String(slug))
  if (!room) return
  const identity = guestIdentity(room.id, String(guestKey ?? ''))
  if (!identity) return
  // Only signal when something actually changed, so this can't be used to spam
  // hosts (pending knocks are themselves rate-limited per IP).
  if ((await cancelPendingKnock(room.id, identity)) > 0) {
    await signalRoom(room.id, 'lobby', { type: 'cancelled' })
  }
}

// ---------------------------------------------------------------------------
// Host-only controls (approved workspace members). Each re-checks on the server.
// ---------------------------------------------------------------------------

export async function listLobby(
  slug: string,
): Promise<{ ok: true; guests: LobbyGuest[] } | { ok: false }> {
  const ctx = await hostContext(slug)
  if (!ctx) return { ok: false }
  return { ok: true, guests: await listPendingKnocks(ctx.room.id) }
}

export async function respondToKnock(slug: string, knockId: string, admit: boolean): Promise<Ok> {
  const ctx = await hostContext(slug)
  if (!ctx) return { ok: false, error: 'Only hosts can do that.' }
  if (!UUID_RE.test(String(knockId))) return { ok: false, error: 'Unknown guest.' }
  const ok = await decideKnock(ctx.room.id, knockId, admit ? 'admitted' : 'denied')
  // Let other hosts' lobby lists refresh straight away.
  await signalRoom(ctx.room.id, 'lobby', { type: 'decided' })
  return ok ? { ok: true } : { ok: false, error: 'That guest is no longer waiting.' }
}

function cleanIdentity(value: unknown): string | null {
  const s = String(value ?? '')
  return /^[A-Za-z0-9_-]{3,80}$/.test(s) ? s : null
}

export async function muteParticipant(
  slug: string,
  identity: string,
  trackSid: string,
): Promise<Ok> {
  const ctx = await hostContext(slug)
  if (!ctx) return { ok: false, error: 'Only hosts can do that.' }
  const who = cleanIdentity(identity)
  const sid = /^TR_[A-Za-z0-9]{3,60}$/.test(String(trackSid)) ? String(trackSid) : null
  if (!who || !sid) return { ok: false, error: 'Unknown participant.' }
  try {
    await roomService().mutePublishedTrack(livekitRoomName(ctx.room.id), who, sid, true)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not mute. They may have left.' }
  }
}

export async function removeParticipant(
  slug: string,
  identity: string,
): Promise<{ ok: true; lobbyTurnedOn: boolean } | { ok: false; error: string }> {
  const ctx = await hostContext(slug)
  if (!ctx) return { ok: false, error: 'Only hosts can do that.' }
  const who = cleanIdentity(identity)
  if (!who) return { ok: false, error: 'Unknown participant.' }
  let lobbyTurnedOn = false
  if (who.startsWith('g_')) {
    // Revoke their admission first, so they can't just refresh back in.
    await denyIdentity(ctx.room.id, who)
    // With the lobby off anyone can walk straight back in under a fresh name,
    // so removing someone turns the lobby on: they'd have to ask again.
    if (!ctx.room.lobbyEnabled) {
      await applyRoomLobby(ctx.room.id, true)
      lobbyTurnedOn = true
    }
  }
  try {
    await roomService().removeParticipant(livekitRoomName(ctx.room.id), who)
  } catch {
    // Already gone.
  }
  return { ok: true, lobbyTurnedOn }
}

/**
 * Called by a host's browser whenever a guest connects: if that guest was
 * removed earlier, take them out again. (A removed guest could otherwise
 * reconnect directly with a token they already hold, for its short lifetime.)
 */
export async function enforceGuestAccess(slug: string, identity: string): Promise<void> {
  const ctx = await hostContext(slug)
  const who = cleanIdentity(identity)
  if (!ctx || !who?.startsWith('g_')) return
  const knock = await findLatestKnock(ctx.room.id, who)
  if (knock?.status !== 'denied') return
  try {
    await roomService().removeParticipant(livekitRoomName(ctx.room.id), who)
  } catch {
    // Already gone.
  }
}

export async function startRecording(slug: string, timeZone?: string): Promise<Ok> {
  const ctx = await hostContext(slug)
  if (!ctx) return { ok: false, error: 'Only hosts can record.' }
  const tz = typeof timeZone === 'string' ? timeZone.slice(0, 64) : undefined
  return startMeetingRecording(ctx.room, ctx.me.id, tz)
}

export async function stopRecording(slug: string): Promise<Ok> {
  const ctx = await hostContext(slug)
  if (!ctx) return { ok: false, error: 'Only hosts can stop recording.' }
  return stopMeetingRecording(ctx.room.id)
}

/** Email invites to a room (comma/space/newline separated, up to 10 at once). */
export async function inviteToRoom(
  slug: string,
  emails: string,
): Promise<{ ok: true; sent: number; failed: string[] } | { ok: false; error: string }> {
  const ctx = await hostContext(slug)
  if (!ctx) return { ok: false, error: 'Only hosts can invite people.' }
  const list = [
    ...new Set(
      String(emails ?? '')
        .split(/[\s,;]+/)
        .map(cleanEmail)
        .filter(Boolean),
    ),
  ]
  const invalid = list.filter((e) => !EMAIL_RE.test(e))
  if (invalid.length) return { ok: false, error: `Not a valid email: ${invalid[0]}` }
  if (list.length === 0) return { ok: false, error: 'Add at least one email.' }
  if (list.length > MAX_INVITES) return { ok: false, error: `Invite up to ${MAX_INVITES} at a time.` }

  const url = `https://${APP_DOMAIN}/m/${ctx.room.slug}`
  // Awaited so delivery actually completes before the action returns.
  const results = await Promise.all(
    list.map(async (email) => {
      try {
        const sent = await notifyMeetingInvite({
          email,
          inviterName: ctx.me.name,
          roomName: ctx.room.name,
          workspaceName: ctx.room.brand.name || ctx.room.workspaceName,
          url,
        })
        return { email, sent }
      } catch (error) {
        console.error('[meeting] invite email failed:', error)
        return { email, sent: false }
      }
    }),
  )
  return {
    ok: true,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).map((r) => r.email),
  }
}
