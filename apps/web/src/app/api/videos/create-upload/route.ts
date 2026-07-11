import { NextResponse } from 'next/server'
import { buildShareUrl, type CreateUploadResponse } from '@lmsy/shared'
import { getAuthedUserId } from '@/lib/api-auth'
import { getMux } from '@/lib/mux'
import { generateShareSlug } from '@/lib/slug'
import { createVideoForUpload, deleteOwnedVideo } from '@/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const userId = await getAuthedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { title?: unknown }
  const rawTitle = typeof body.title === 'string' ? body.title.trim() : ''
  const title = rawTitle ? rawTitle.slice(0, 200) : 'Untitled recording'

  const video = await createVideoForUpload(userId, title, generateShareSlug)

  try {
    // Direct upload → bytes go straight to Mux, never through our server. The
    // videoId rides along as `passthrough` so webhooks can correlate back.
    const upload = await getMux().video.uploads.create({
      cors_origin: '*',
      new_asset_settings: {
        playback_policies: ['public'],
        // 'standard' is deprecated and rejected on basic-tier assets; 'capped-1080p'
        // is the modern equivalent that produces downloadable MP4 renditions.
        mp4_support: 'capped-1080p',
        passthrough: video.id,
      },
    })

    if (!upload.url) {
      throw new Error('Mux did not return an upload URL')
    }

    const response: CreateUploadResponse = {
      videoId: video.id,
      uploadUrl: upload.url,
      shareUrl: buildShareUrl(video.shareSlug),
    }
    return NextResponse.json(response)
  } catch (error) {
    // Roll back the orphaned row so a failed Mux call leaves no 'uploading' junk.
    await deleteOwnedVideo(userId, video.id).catch(() => undefined)
    console.error('[create-upload] Mux upload failed:', error)
    return NextResponse.json({ error: 'Could not create upload' }, { status: 502 })
  }
}
