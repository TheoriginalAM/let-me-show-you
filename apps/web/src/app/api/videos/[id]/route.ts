import { NextResponse } from 'next/server'
import { getAuthedUserId } from '@/lib/api-auth'
import { getMux } from '@/lib/mux'
import { deleteOwnedVideo, getManageableVideo } from '@/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Delete a video the caller can manage (a member of its workspace), incl. its Mux asset. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  // Membership-scoped fetch: confirms access and gives us the Mux asset id.
  const video = await getManageableVideo(userId, id)
  if (!video) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (video.muxAssetId) {
    try {
      await getMux().video.assets.delete(video.muxAssetId)
    } catch (error) {
      const status = (error as { status?: number })?.status
      // 404 = already gone upstream, safe to proceed. Any other failure (rate
      // limit, 5xx, credential/network error) must NOT delete our row — doing so
      // would orphan a billable Mux asset with no reference. Surface it so the
      // client can retry instead.
      if (status !== 404) {
        console.error('[videos.delete] Mux asset delete failed:', error)
        return NextResponse.json({ error: 'Could not delete the video' }, { status: 502 })
      }
    }
  }

  await deleteOwnedVideo(userId, id)
  return new NextResponse(null, { status: 204 })
}
