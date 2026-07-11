import { NextResponse } from 'next/server'
import { getMux, muxWebhookSecret } from '@/lib/mux'
import { markVideoErrored, markVideoProcessing, markVideoReady } from '@/db/queries'

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
      const videoId = event.data.new_asset_settings?.passthrough
      const assetId = event.data.asset_id
      if (videoId && assetId) await markVideoProcessing(videoId, assetId)
      break
    }
    case 'video.asset.ready': {
      const videoId = event.data.passthrough
      const playbackId = event.data.playback_ids?.[0]?.id
      const duration =
        typeof event.data.duration === 'number' ? Math.round(event.data.duration) : null
      if (videoId && playbackId) await markVideoReady(videoId, playbackId, duration)
      break
    }
    case 'video.asset.errored': {
      const videoId = event.data.passthrough
      if (videoId) await markVideoErrored(videoId)
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
