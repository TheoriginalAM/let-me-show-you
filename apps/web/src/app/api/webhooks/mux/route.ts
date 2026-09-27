import { NextResponse } from 'next/server'
import { getMux, muxWebhookSecret } from '@/lib/mux'
import { finishMeetingRecording } from '@/lib/meeting-recording'
import { linkVideoAsset, markVideoErrored, markVideoReady } from '@/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Raw body is required for signature verification.
  const body = await request.text()

  let event
  try {
    // unwrap() verifies the Mux signature AND parses the event (throws on either).
    event = await getMux().webhooks.unwrap(body, request.headers, muxWebhookSecret())
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  switch (event.type) {
    case 'video.upload.asset_created': {
      // Never downgrades: a retried delivery after asset.ready must not push the
      // video back to 'processing'.
      const videoId = event.data.new_asset_settings?.passthrough
      const assetId = event.data.asset_id
      if (videoId && assetId) await linkVideoAsset(videoId, assetId)
      break
    }
    case 'video.asset.created': {
      // Uploads are linked via upload.asset_created above; meeting recordings
      // (assets recorded from a live stream) are linked here. Never downgrades a
      // video that's already ready, in case this event arrives late.
      const videoId = event.data.passthrough
      if (event.data.live_stream_id && videoId) await linkVideoAsset(videoId, event.data.id)
      break
    }
    case 'video.asset.ready': {
      // A meeting recording is "ready" (playable as DVR) while the call is still
      // going; wait for live_stream_completed so the duration is final.
      if (event.data.live_stream_id && event.data.is_live) break
      const videoId = event.data.passthrough
      const playbackId = event.data.playback_ids?.[0]?.id
      const duration =
        typeof event.data.duration === 'number' ? Math.round(event.data.duration) : null
      if (videoId && playbackId) await markVideoReady(videoId, playbackId, duration, event.data.id)
      break
    }
    case 'video.asset.live_stream_completed': {
      const videoId = event.data.passthrough
      const playbackId = event.data.playback_ids?.[0]?.id
      const duration =
        typeof event.data.duration === 'number' ? Math.round(event.data.duration) : null
      if (videoId && playbackId) {
        await markVideoReady(videoId, playbackId, duration, event.data.id)
        await finishMeetingRecording(videoId, 'completed')
      }
      break
    }
    case 'video.asset.errored': {
      const videoId = event.data.passthrough
      if (videoId) {
        await markVideoErrored(videoId)
        await finishMeetingRecording(videoId, 'failed')
      }
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
