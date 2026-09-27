import 'server-only'

import {
  EgressStatus,
  EncodingOptionsPreset,
  StreamOutput,
  StreamProtocol,
} from 'livekit-server-sdk'
import { createNotifications } from '@/db/app-notifications'
import {
  attachRecordingMedia,
  claimRecording,
  deleteRecordingVideo,
  failRecording,
  finalizeRecordingForVideo,
  getActiveRecording,
  inFlightRecordingForVideo,
  inFlightRecordingsForWorkspace,
  listInFlightRecordings,
  listRoomsForWorkspace,
  markRecordingStopping,
  recordingAssetId,
  recordingIsStale,
  type MeetingRoom,
} from '@/db/meetings'
import { createVideoForUpload, linkVideoAsset, markVideoErrored, markVideoReady } from '@/db/queries'
import type { MeetingRecordingRow } from '@/db/schema'
import { egressService, livekitRoomName, roomService } from './livekit'
import { getMux } from './mux'
import { generateShareSlug } from './slug'

type Result = { ok: true } | { ok: false; error: string }

const LIVE_EGRESS = new Set<EgressStatus>([
  EgressStatus.EGRESS_STARTING,
  EgressStatus.EGRESS_ACTIVE,
  EgressStatus.EGRESS_ENDING,
])
/**
 * How long a claimed slot may sit without media attached before it's abandoned.
 * Generous: creating the Mux stream can take a while with SDK retries.
 */
const START_GRACE_MS = 5 * 60 * 1000
/** How long after egress ends Mux gets to show an asset before we give up. */
const ASSET_GRACE_MS = 2 * 60 * 1000
/** How long after egress ends we wait for Mux's completion webhook before checking Mux directly. */
const WEBHOOK_GRACE_MS = 10 * 60 * 1000
/** Mux's RTMPS ingest (encrypted, so the stream key isn't sent in the clear). */
const MUX_RTMPS = 'rtmps://global-live.mux.com:443/app'

function recordingTitle(roomName: string, timeZone?: string): string {
  let tz = 'UTC'
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-AU', { timeZone })
      tz = timeZone
    } catch {
      // Unknown zone from the client: fall back to UTC.
    }
  }
  const when = new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(new Date())
  return `${roomName} · ${when}`.slice(0, 200)
}

/**
 * A Mux live stream that only exists to record: no live playback, and its
 * recorded asset carries our video id as passthrough (like uploads do).
 */
async function createRecordingStream(videoId: string) {
  const mux = getMux()
  const base = { latency_mode: 'standard' as const, reconnect_window: 30, passthrough: videoId }
  try {
    return await mux.video.liveStreams.create({
      ...base,
      new_asset_settings: {
        playback_policies: ['public'],
        mp4_support: 'capped-1080p',
        passthrough: videoId,
      },
    })
  } catch (error) {
    // Some Mux plans reject MP4 renditions on live-recorded assets: record without.
    if ((error as { status?: number })?.status !== 400) throw error
    return mux.video.liveStreams.create({
      ...base,
      new_asset_settings: { playback_policies: ['public'], passthrough: videoId },
    })
  }
}

/** Asset ids Mux has recorded from a live stream (null if the lookup fails). */
async function streamAssetIds(liveStreamId: string): Promise<string[] | null> {
  try {
    const ls = await getMux().video.liveStreams.retrieve(liveStreamId)
    const ids = [...(ls.recent_asset_ids ?? [])]
    if (ls.active_asset_id && !ids.includes(ls.active_asset_id)) ids.push(ls.active_asset_id)
    return ids
  } catch (error) {
    // 404 = stream already deleted: nothing more can be recorded from it.
    if ((error as { status?: number })?.status === 404) return []
    return null
  }
}

/** Start recording a live meeting into the room's workspace as a new (private) video. */
export async function startMeetingRecording(
  room: MeetingRoom,
  userId: string,
  timeZone?: string,
): Promise<Result> {
  await reconcileRoomRecordings(room.id)
  if (await getActiveRecording(room.id)) {
    return { ok: false, error: 'This meeting is already being recorded.' }
  }
  const lkRoom = livekitRoomName(room.id)
  try {
    // Ignore egresses we've already stopped (they linger briefly while ending).
    const finishing = new Set(
      (await listInFlightRecordings(room.id)).map((r) => r.egressId).filter(Boolean),
    )
    const running = (await egressService().listEgress({ roomName: lkRoom, active: true })).filter(
      (e) => e.status !== EgressStatus.EGRESS_ENDING && !finishing.has(e.egressId),
    )
    if (running.length > 0) return { ok: false, error: 'This meeting is already being recorded.' }
    const participants = await roomService().listParticipants(lkRoom)
    if (participants.length === 0) return { ok: false, error: 'Join the meeting before recording.' }
  } catch (error) {
    console.error('[meeting] could not read room state:', error)
    return { ok: false, error: 'Could not reach the meeting server. Please try again.' }
  }

  const video = await createVideoForUpload(
    userId,
    room.workspaceId,
    recordingTitle(room.name, timeZone),
    generateShareSlug,
    { status: 'processing', isPublic: false },
  )
  let recordingId: string | null
  try {
    recordingId = await claimRecording({
      roomId: room.id,
      videoId: video.id,
      startedByUserId: userId,
    })
  } catch (error) {
    console.error('[meeting] could not claim the recording slot:', error)
    await deleteRecordingVideo(video.id)
    return { ok: false, error: 'Could not start recording. Please try again.' }
  }
  if (!recordingId) {
    await deleteRecordingVideo(video.id)
    return { ok: false, error: 'This meeting is already being recorded.' }
  }

  let streamId: string | null = null
  let egressId: string | null = null
  try {
    const stream = await createRecordingStream(video.id)
    streamId = stream.id
    const egress = await egressService().startRoomCompositeEgress(
      lkRoom,
      new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [`${MUX_RTMPS}/${stream.stream_key}`],
      }),
      { layout: 'speaker', encodingOptions: EncodingOptionsPreset.H264_1080P_30 },
    )
    egressId = egress.egressId
    if (!(await attachRecordingMedia(recordingId, { egressId, muxLiveStreamId: stream.id }))) {
      throw new Error('recording was abandoned while starting')
    }
    return { ok: true }
  } catch (error) {
    console.error('[meeting] start recording failed:', error)
    if (egressId) await egressService().stopEgress(egressId).catch(() => undefined)
    if (streamId) await getMux().video.liveStreams.delete(streamId).catch(() => undefined)
    await failRecording(recordingId)
    await deleteRecordingVideo(video.id)
    return { ok: false, error: 'Could not start recording. Please try again.' }
  }
}

/**
 * Stop the room's recording. Idempotent. The video becomes ready when Mux sends
 * `video.asset.live_stream_completed` (see the Mux webhook).
 */
export async function stopMeetingRecording(roomId: string): Promise<Result> {
  const active = await getActiveRecording(roomId)
  if (!active) {
    // Nothing tracked as live: still make sure no stray egress keeps billing.
    try {
      const running = await egressService().listEgress({
        roomName: livekitRoomName(roomId),
        active: true,
      })
      await Promise.all(
        running.map((e) =>
          egressService()
            .stopEgress(e.egressId)
            .catch(() => undefined),
        ),
      )
    } catch {
      // LiveKit unreachable: nothing more we can do here.
    }
    return { ok: true }
  }
  if (active.egressId) {
    await egressService()
      .stopEgress(active.egressId)
      .catch(() => undefined) // already ended
  }
  if (active.muxLiveStreamId) {
    // Tell Mux not to wait out the reconnect window: finalize the recording now.
    await getMux()
      .video.liveStreams.complete(active.muxLiveStreamId)
      .catch(() => undefined)
  }
  await markRecordingStopping(active.id)
  return { ok: true }
}

/**
 * Finalize the recording behind a video (called from the Mux webhook): mark it
 * done, delete the now-unneeded live stream, and tell the host.
 */
export async function finishMeetingRecording(
  videoId: string,
  status: 'completed' | 'failed',
): Promise<void> {
  const done = await finalizeRecordingForVideo(videoId, status)
  if (!done) return
  if (done.muxLiveStreamId) {
    await getMux()
      .video.liveStreams.delete(done.muxLiveStreamId)
      .catch(() => undefined)
  }
  if (status === 'completed' && done.startedByUserId) {
    // Recordings are private until shared, so point at the dashboard (the
    // public /v/<slug> page 404s for private videos).
    await createNotifications([done.startedByUserId], {
      type: 'meeting_recording',
      title: 'Your meeting recording is ready',
      body: `${done.videoTitle}. It's private until you share it.`,
      linkPath: '/dashboard',
    }).catch((error) => console.error('[meeting] ready notification failed:', error))
  }
}

/** Run a Mux delete; true if it's gone (404 counts as gone). */
async function muxDeleted(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run()
    return true
  } catch (error) {
    return (error as { status?: number })?.status === 404
  }
}

/**
 * Throw a recording away entirely: stop the egress, delete the live stream and
 * every asset it produced, and delete the video. Compare-and-set first, so a
 * recording that finished meanwhile is left alone.
 *
 * Returns false if Mux cleanup didn't fully succeed. The video is then kept
 * (marked errored, pointing at its asset) rather than deleted, so a billable
 * asset is never left with nothing referencing it; a later delete can retry.
 */
async function abandon(row: MeetingRecordingRow): Promise<boolean> {
  if (!(await failRecording(row.id))) return true // already finished elsewhere
  if (row.egressId) {
    try {
      await egressService().stopEgress(row.egressId)
    } catch {
      // Already ended (or LiveKit isn't configured any more).
    }
  }
  const mux = getMux()
  let clean = true
  const assetIds = new Set<string>()
  if (row.videoId) {
    const linked = await recordingAssetId(row.videoId)
    if (linked) assetIds.add(linked)
  }
  if (row.muxLiveStreamId) {
    const liveStreamId = row.muxLiveStreamId
    const found = await streamAssetIds(liveStreamId)
    if (found === null) clean = false
    else found.forEach((id) => assetIds.add(id))
    if (!(await muxDeleted(() => mux.video.liveStreams.delete(liveStreamId)))) clean = false
  }
  const remaining: string[] = []
  for (const assetId of assetIds) {
    if (!(await muxDeleted(() => mux.video.assets.delete(assetId)))) remaining.push(assetId)
  }
  if (remaining.length) clean = false

  if (!row.videoId) return clean
  if (clean) {
    await deleteRecordingVideo(row.videoId)
    return true
  }
  const keep = remaining[remaining.length - 1]
  if (keep) await linkVideoAsset(row.videoId, keep)
  await markVideoErrored(row.videoId)
  console.error('[meeting] recording cleanup incomplete; kept video', row.videoId)
  return false
}

/**
 * Self-heal one unfinished recording. Covers a start that died halfway, an egress
 * that ended without the host pressing Stop (everyone left), media that never
 * reached Mux, a late or missed Mux webhook, and a video deleted mid-recording.
 */
async function reconcileRow(row: MeetingRecordingRow): Promise<void> {
  try {
    const ageMs = Date.now() - new Date(row.createdAt).getTime()
    if (!row.videoId) {
      // The video was deleted out from under the recording: stop feeding it.
      await abandon(row)
      return
    }
    if (!row.egressId) {
      // Slot claimed but the start never finished (crashed or still slow).
      if (ageMs > START_GRACE_MS) await abandon(row)
      return
    }

    const [info] = await egressService().listEgress({ egressId: row.egressId })
    const live = Boolean(info && LIVE_EGRESS.has(info.status))
    if (live && !recordingIsStale(row)) return
    if (live) await egressService().stopEgress(row.egressId).catch(() => undefined)

    const endedMs = info?.endedAt ? Number(info.endedAt / BigInt(1_000_000)) : 0
    // No egress info at all: fall back to the row's age rather than "forever ago".
    const sinceEnd = endedMs ? Date.now() - endedMs : ageMs

    let assetId = await recordingAssetId(row.videoId)
    if (!assetId && row.muxLiveStreamId) {
      // The asset webhook may just be late: ask Mux before concluding nothing
      // was recorded (deleting here would lose a real recording).
      const found = await streamAssetIds(row.muxLiveStreamId)
      if (found === null) return // Mux unreachable: decide later
      assetId = found[found.length - 1] ?? null
      if (assetId) await linkVideoAsset(row.videoId, assetId)
    }
    if (!assetId) {
      if (sinceEnd > ASSET_GRACE_MS || recordingIsStale(row)) {
        await abandon(row)
      } else if (info && !live && row.status === 'recording') {
        // The egress is definitely over (e.g. it failed to reach Mux): free the
        // room's slot now so the host can press Record again, and keep the row
        // in flight so a late asset is still picked up (or abandoned after grace).
        await markRecordingStopping(row.id)
      }
      return
    }

    // Media exists: make sure Mux finalizes it, then wait for the webhook.
    if (row.status === 'recording') {
      if (row.muxLiveStreamId) {
        await getMux()
          .video.liveStreams.complete(row.muxLiveStreamId)
          .catch(() => undefined)
      }
      await markRecordingStopping(row.id)
    }
    if (sinceEnd < WEBHOOK_GRACE_MS && !recordingIsStale(row)) return

    // The webhook looks missed: read the asset from Mux and finish it ourselves.
    const asset = await getMux().video.assets.retrieve(assetId)
    if (asset.status === 'ready' && !asset.is_live) {
      const playbackId = asset.playback_ids?.[0]?.id
      if (playbackId) {
        const duration = typeof asset.duration === 'number' ? Math.round(asset.duration) : null
        await markVideoReady(row.videoId, playbackId, duration, assetId)
        await finishMeetingRecording(row.videoId, 'completed')
      }
    } else if (asset.status === 'errored') {
      await markVideoErrored(row.videoId)
      await finishMeetingRecording(row.videoId, 'failed')
    }
  } catch (error) {
    // LiveKit/Mux unreachable: leave state as-is and try again next time.
    console.error('[meeting] reconcile failed:', error)
  }
}

/** Reconcile a room's unfinished recordings. One indexed query when idle. */
export async function reconcileRoomRecordings(roomId: string): Promise<void> {
  const rows = await listInFlightRecordings(roomId)
  for (const row of rows) await reconcileRow(row)
}

/** Reconcile every unfinished recording in a workspace (dashboard load). */
export async function reconcileWorkspaceRecordings(workspaceId: string): Promise<void> {
  const rows = await inFlightRecordingsForWorkspace(workspaceId)
  for (const row of rows) await reconcileRow(row)
}

/**
 * The user is deleting a video: if a recording is still feeding it, throw that
 * away too. Returns false if Mux cleanup failed (the caller should not delete).
 */
export async function discardRecordingForVideo(videoId: string): Promise<boolean> {
  const row = await inFlightRecordingForVideo(videoId)
  return row ? abandon(row) : true
}

/**
 * A workspace is being deleted: end its live calls and throw away its unfinished
 * recordings, so no egress or live stream keeps running (and billing) after the
 * rows are gone.
 */
export async function shutdownWorkspaceMeetings(workspaceId: string): Promise<void> {
  for (const row of await inFlightRecordingsForWorkspace(workspaceId)) await abandon(row)
  for (const room of await listRoomsForWorkspace(workspaceId)) {
    try {
      await roomService().deleteRoom(livekitRoomName(room.id))
    } catch {
      // No live call (or LiveKit isn't configured).
    }
  }
}
