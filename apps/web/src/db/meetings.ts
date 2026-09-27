import 'server-only'

import { and, count, desc, eq, gt, inArray, ne, or, sql } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { pgErrorCode } from './errors'
import { db } from './index'
import {
  meetingKnocks,
  meetingRecordings,
  meetingRooms,
  videos,
  workspaceMembers,
  workspaces,
  type MeetingKnockRow,
  type MeetingRecordingRow,
} from './schema'
import type { WorkspaceBrand } from './workspaces'

// Meet-style room codes (abc-defg-hij). No 'l' so the code reads unambiguously.
const code = customAlphabet('abcdefghijkmnopqrstuvwxyz', 10)

export function generateRoomSlug(): string {
  const s = code()
  return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
}

/** How far back we look for a guest's latest knock (a decline sticks this long). */
const KNOCK_TTL_MS = 12 * 60 * 60 * 1000
/**
 * A waiting guest polls every few seconds; if we haven't heard from them for this
 * long they've closed the tab, so hosts stop seeing them. (Generous, because
 * browsers throttle timers in background tabs to about once a minute.)
 */
export const KNOCK_PRESENCE_MS = 90 * 1000
/** A recording can't outlive Mux's 12h max continuous duration. */
const RECORDING_TTL_MS = 13 * 60 * 60 * 1000

const IN_FLIGHT = ['recording', 'stopping']

export interface MeetingRoom {
  id: string
  workspaceId: string
  name: string
  slug: string
  lobbyEnabled: boolean
  createdByUserId: string | null
  createdAt: string
}

export interface PublicMeetingRoom extends MeetingRoom {
  workspaceName: string
  brand: Pick<WorkspaceBrand, 'name' | 'logo' | 'color'>
}

const roomColumns = {
  id: meetingRooms.id,
  workspaceId: meetingRooms.workspaceId,
  name: meetingRooms.name,
  slug: meetingRooms.slug,
  lobbyEnabled: meetingRooms.lobbyEnabled,
  createdByUserId: meetingRooms.createdByUserId,
  createdAt: meetingRooms.createdAt,
}

function cleanRoomName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 80)
}

function nowIso(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** A room by its public slug, with the workspace's branding (for the join page). */
export async function getRoomBySlug(slug: string): Promise<PublicMeetingRoom | null> {
  const rows = await db
    .select({
      ...roomColumns,
      workspaceName: workspaces.name,
      brandName: workspaces.brandName,
      brandLogo: workspaces.brandLogo,
      brandColor: workspaces.brandColor,
    })
    .from(meetingRooms)
    .innerJoin(workspaces, eq(meetingRooms.workspaceId, workspaces.id))
    .where(eq(meetingRooms.slug, slug))
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    slug: r.slug,
    lobbyEnabled: r.lobbyEnabled,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt,
    workspaceName: r.workspaceName,
    brand: { name: r.brandName, logo: r.brandLogo, color: r.brandColor },
  }
}

/** A workspace's rooms, oldest first (the default room stays on top). */
export async function listRoomsForWorkspace(workspaceId: string): Promise<MeetingRoom[]> {
  return db
    .select(roomColumns)
    .from(meetingRooms)
    .where(eq(meetingRooms.workspaceId, workspaceId))
    .orderBy(meetingRooms.createdAt)
}

/** A room the user can manage (any member of its workspace), or null. */
export async function getRoomForMember(userId: string, roomId: string): Promise<MeetingRoom | null> {
  const rows = await db
    .select(roomColumns)
    .from(meetingRooms)
    .innerJoin(workspaceMembers, eq(meetingRooms.workspaceId, workspaceMembers.workspaceId))
    .where(and(eq(meetingRooms.id, roomId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1)
  return rows.length > 0
}

/** Create a room in a workspace the user belongs to. Null if not a member. */
export async function createRoom(
  userId: string,
  workspaceId: string,
  name: string,
): Promise<MeetingRoom | null> {
  if (!(await isMember(userId, workspaceId))) return null
  const clean = cleanRoomName(name) || 'Meeting room'
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await db
        .insert(meetingRooms)
        .values({ workspaceId, name: clean, slug: generateRoomSlug(), createdByUserId: userId })
        .returning(roomColumns)
      return rows[0]!
    } catch (error) {
      // 23505 = unique_violation (slug clash) → retry; anything else is fatal.
      if (pgErrorCode(error) !== '23505') throw error
      lastError = error
    }
  }
  throw lastError
}

/**
 * Give a workspace its first room so there's always a link to share. A
 * transaction-scoped advisory lock per workspace stops two simultaneous first
 * page loads from both creating one.
 */
export async function ensureDefaultRoom(
  userId: string,
  workspaceId: string,
  workspaceName: string,
): Promise<void> {
  if (!(await isMember(userId, workspaceId))) return
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`meeting-room:${workspaceId}`}))`)
    const rows = await tx
      .select({ n: count() })
      .from(meetingRooms)
      .where(eq(meetingRooms.workspaceId, workspaceId))
    if (Number(rows[0]?.n ?? 0) > 0) return
    await tx.insert(meetingRooms).values({
      workspaceId,
      name: cleanRoomName(`${workspaceName} meeting room`) || 'Meeting room',
      slug: generateRoomSlug(),
      createdByUserId: userId,
    })
  })
}

export async function renameRoom(userId: string, roomId: string, name: string): Promise<boolean> {
  const room = await getRoomForMember(userId, roomId)
  const clean = cleanRoomName(name)
  if (!room || !clean) return false
  await db.update(meetingRooms).set({ name: clean }).where(eq(meetingRooms.id, roomId))
  return true
}

/** Turn a room's lobby on/off (member-scoped). */
export async function setRoomLobby(
  userId: string,
  roomId: string,
  enabled: boolean,
): Promise<boolean> {
  if (!(await getRoomForMember(userId, roomId))) return false
  await applyRoomLobby(roomId, enabled)
  return true
}

/**
 * Set the lobby without a membership check (callers must have authorized the
 * host). Turning it on also voids earlier admissions, so anyone let in while it
 * was off (or in an earlier meeting) has to ask again.
 */
export async function applyRoomLobby(roomId: string, enabled: boolean): Promise<void> {
  await db.update(meetingRooms).set({ lobbyEnabled: enabled }).where(eq(meetingRooms.id, roomId))
  if (enabled) {
    await db
      .update(meetingKnocks)
      .set({ status: 'expired' })
      .where(and(eq(meetingKnocks.roomId, roomId), eq(meetingKnocks.status, 'admitted')))
  }
}

export async function deleteRoom(userId: string, roomId: string): Promise<boolean> {
  if (!(await getRoomForMember(userId, roomId))) return false
  await db.delete(meetingRooms).where(eq(meetingRooms.id, roomId))
  return true
}

// ---------------------------------------------------------------------------
// Lobby (knocks)
// ---------------------------------------------------------------------------

/** The guest's most recent knock on this room, if within the lookback window. */
export async function findLatestKnock(
  roomId: string,
  identity: string,
): Promise<MeetingKnockRow | null> {
  const rows = await db
    .select()
    .from(meetingKnocks)
    .where(
      and(
        eq(meetingKnocks.roomId, roomId),
        eq(meetingKnocks.identity, identity),
        gt(meetingKnocks.createdAt, new Date(Date.now() - KNOCK_TTL_MS).toISOString()),
      ),
    )
    .orderBy(desc(meetingKnocks.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function createKnock(input: {
  roomId: string
  identity: string
  name: string
  email: string
  ipHash: string | null
  status: 'pending' | 'admitted'
}): Promise<void> {
  await db.insert(meetingKnocks).values({
    roomId: input.roomId,
    identity: input.identity,
    name: input.name,
    email: input.email,
    ipHash: input.ipHash,
    status: input.status,
    decidedAt: input.status === 'admitted' ? nowIso() : null,
  })
}

/** Whether a pending guest has polled recently (i.e. is still waiting). */
export function knockIsPresent(knock: MeetingKnockRow): boolean {
  return Date.now() - new Date(knock.lastSeenAt).getTime() < KNOCK_PRESENCE_MS
}

/** A waiting guest checked in: keep them visible in the host's lobby list. */
export async function touchKnock(knockId: string): Promise<void> {
  await db
    .update(meetingKnocks)
    .set({ lastSeenAt: nowIso() })
    .where(and(eq(meetingKnocks.id, knockId), eq(meetingKnocks.status, 'pending')))
}

/**
 * Retire an admission that no longer counts. Compare-and-set: returns false if
 * the knock changed meanwhile (e.g. a host just removed them, making it 'denied').
 */
export async function expireKnock(knockId: string): Promise<boolean> {
  const rows = await db
    .update(meetingKnocks)
    .set({ status: 'expired' })
    .where(and(eq(meetingKnocks.id, knockId), eq(meetingKnocks.status, 'admitted')))
    .returning({ id: meetingKnocks.id })
  return rows.length > 0
}

/** A room's lobby flag, read fresh (right before letting a guest straight in). */
export async function roomLobbyEnabled(roomId: string): Promise<boolean> {
  const rows = await db
    .select({ on: meetingRooms.lobbyEnabled })
    .from(meetingRooms)
    .where(eq(meetingRooms.id, roomId))
    .limit(1)
  return rows[0]?.on ?? true
}

/** Join/knock attempts on a room from one IP since `since` (rate limiting). */
export async function countRecentKnocksByIp(
  roomId: string,
  ipHash: string | null,
  since: Date,
): Promise<number> {
  if (!ipHash) return 0
  const rows = await db
    .select({ n: count() })
    .from(meetingKnocks)
    .where(
      and(
        eq(meetingKnocks.roomId, roomId),
        eq(meetingKnocks.ipHash, ipHash),
        gt(meetingKnocks.createdAt, since.toISOString()),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

export interface LobbyGuest {
  id: string
  name: string
  email: string
  createdAt: string
}

/** Guests waiting to be let in right now (still polling), oldest first. */
export async function listPendingKnocks(roomId: string): Promise<LobbyGuest[]> {
  return db
    .select({
      id: meetingKnocks.id,
      name: meetingKnocks.name,
      email: meetingKnocks.email,
      createdAt: meetingKnocks.createdAt,
    })
    .from(meetingKnocks)
    .where(
      and(
        eq(meetingKnocks.roomId, roomId),
        eq(meetingKnocks.status, 'pending'),
        gt(meetingKnocks.lastSeenAt, new Date(Date.now() - KNOCK_PRESENCE_MS).toISOString()),
      ),
    )
    .orderBy(meetingKnocks.createdAt)
}

/** Admit or deny a pending knock. Returns false if it wasn't pending in this room. */
export async function decideKnock(
  roomId: string,
  knockId: string,
  status: 'admitted' | 'denied',
): Promise<boolean> {
  const rows = await db
    .update(meetingKnocks)
    .set({ status, decidedAt: nowIso() })
    .where(
      and(
        eq(meetingKnocks.id, knockId),
        eq(meetingKnocks.roomId, roomId),
        eq(meetingKnocks.status, 'pending'),
      ),
    )
    .returning({ id: meetingKnocks.id })
  return rows.length > 0
}

/** A guest gave up waiting: withdraw their pending knock. Returns rows changed. */
export async function cancelPendingKnock(roomId: string, identity: string): Promise<number> {
  const rows = await db
    .update(meetingKnocks)
    .set({ status: 'cancelled', decidedAt: nowIso() })
    .where(
      and(
        eq(meetingKnocks.roomId, roomId),
        eq(meetingKnocks.identity, identity),
        eq(meetingKnocks.status, 'pending'),
      ),
    )
    .returning({ id: meetingKnocks.id })
  return rows.length
}

/**
 * Revoke a guest's access (removed from the call), so a refresh can't mint a
 * fresh token from an old admission.
 */
export async function denyIdentity(roomId: string, identity: string): Promise<void> {
  await db
    .update(meetingKnocks)
    .set({ status: 'denied', decidedAt: nowIso() })
    .where(
      and(
        eq(meetingKnocks.roomId, roomId),
        eq(meetingKnocks.identity, identity),
        ne(meetingKnocks.status, 'denied'),
      ),
    )
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

/** The room's live recording (the one holding its single slot), if any. */
export async function getActiveRecording(roomId: string): Promise<MeetingRecordingRow | null> {
  const rows = await db
    .select()
    .from(meetingRecordings)
    .where(and(eq(meetingRecordings.roomId, roomId), eq(meetingRecordings.status, 'recording')))
    .limit(1)
  return rows[0] ?? null
}

/** Every unfinished recording in a room ('recording' or 'stopping'). */
export async function listInFlightRecordings(roomId: string): Promise<MeetingRecordingRow[]> {
  return db
    .select()
    .from(meetingRecordings)
    .where(
      and(eq(meetingRecordings.roomId, roomId), inArray(meetingRecordings.status, IN_FLIGHT)),
    )
}

/**
 * Every unfinished recording belonging to a workspace, found through its room or
 * (if the room was deleted) its video.
 */
export async function inFlightRecordingsForWorkspace(
  workspaceId: string,
): Promise<MeetingRecordingRow[]> {
  const rows = await db
    .select({ recording: meetingRecordings })
    .from(meetingRecordings)
    .leftJoin(meetingRooms, eq(meetingRecordings.roomId, meetingRooms.id))
    .leftJoin(videos, eq(meetingRecordings.videoId, videos.id))
    .where(
      and(
        inArray(meetingRecordings.status, IN_FLIGHT),
        or(eq(meetingRooms.workspaceId, workspaceId), eq(videos.workspaceId, workspaceId)),
      ),
    )
  return rows.map((r) => r.recording)
}

/** The unfinished recording feeding a video, if any. */
export async function inFlightRecordingForVideo(
  videoId: string,
): Promise<MeetingRecordingRow | null> {
  const rows = await db
    .select()
    .from(meetingRecordings)
    .where(
      and(eq(meetingRecordings.videoId, videoId), inArray(meetingRecordings.status, IN_FLIGHT)),
    )
    .limit(1)
  return rows[0] ?? null
}

/** Whether an unfinished recording row is older than any recording can run. */
export function recordingIsStale(row: MeetingRecordingRow): boolean {
  return Date.now() - new Date(row.createdAt).getTime() > RECORDING_TTL_MS
}

/**
 * Claim the room's single recording slot before starting any media. Returns the
 * new row id, or null if another recording is already live.
 */
export async function claimRecording(input: {
  roomId: string
  videoId: string
  startedByUserId: string
}): Promise<string | null> {
  try {
    const rows = await db
      .insert(meetingRecordings)
      .values({ ...input, status: 'recording' })
      .returning({ id: meetingRecordings.id })
    return rows[0]?.id ?? null
  } catch (error) {
    // 23505 = the one-live-recording unique index: someone else got there first.
    if (pgErrorCode(error) === '23505') return null
    throw error
  }
}

/**
 * Record the egress + live stream on a claimed row. Only succeeds while the row
 * is still 'recording' (it may have been abandoned while the start was slow).
 */
export async function attachRecordingMedia(
  id: string,
  media: { egressId: string; muxLiveStreamId: string },
): Promise<boolean> {
  const rows = await db
    .update(meetingRecordings)
    .set(media)
    .where(and(eq(meetingRecordings.id, id), eq(meetingRecordings.status, 'recording')))
    .returning({ id: meetingRecordings.id })
  return rows.length > 0
}

/** 'recording' → 'stopping' (frees the room's slot). False if it wasn't recording. */
export async function markRecordingStopping(id: string): Promise<boolean> {
  const rows = await db
    .update(meetingRecordings)
    .set({ status: 'stopping' })
    .where(and(eq(meetingRecordings.id, id), eq(meetingRecordings.status, 'recording')))
    .returning({ id: meetingRecordings.id })
  return rows.length > 0
}

/** Unfinished → 'failed'. False if it had already finished (someone else won). */
export async function failRecording(id: string): Promise<boolean> {
  const rows = await db
    .update(meetingRecordings)
    .set({ status: 'failed', endedAt: nowIso() })
    .where(and(eq(meetingRecordings.id, id), inArray(meetingRecordings.status, IN_FLIGHT)))
    .returning({ id: meetingRecordings.id })
  return rows.length > 0
}

/** The Mux asset id the recording's video has received so far (null = none linked). */
export async function recordingAssetId(videoId: string): Promise<string | null> {
  const rows = await db
    .select({ assetId: videos.muxAssetId })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)
  return rows[0]?.assetId ?? null
}

/** Delete a meeting recording's video row (the recording is being thrown away). */
export async function deleteRecordingVideo(videoId: string): Promise<void> {
  await db.delete(videos).where(eq(videos.id, videoId))
}

export interface FinishedRecording {
  muxLiveStreamId: string | null
  startedByUserId: string | null
  videoTitle: string
}

/**
 * Mark the recording behind `videoId` finished ('completed' or 'failed'). Returns
 * what the caller needs to clean up + notify, or null if it isn't a meeting
 * recording (or was already finalized by someone else).
 */
export async function finalizeRecordingForVideo(
  videoId: string,
  status: 'completed' | 'failed',
): Promise<FinishedRecording | null> {
  const rows = await db
    .update(meetingRecordings)
    .set({ status, endedAt: nowIso() })
    .where(
      and(eq(meetingRecordings.videoId, videoId), inArray(meetingRecordings.status, IN_FLIGHT)),
    )
    .returning({
      muxLiveStreamId: meetingRecordings.muxLiveStreamId,
      startedByUserId: meetingRecordings.startedByUserId,
    })
  const row = rows[0]
  if (!row) return null
  const video = await db
    .select({ title: videos.title })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)
  return {
    muxLiveStreamId: row.muxLiveStreamId,
    startedByUserId: row.startedByUserId,
    videoTitle: video[0]?.title ?? 'Meeting recording',
  }
}
