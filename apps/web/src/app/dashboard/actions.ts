'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { renameOwnedVideo, setOwnedVideoVisibility } from '@/db/queries'

type ActionResult = { ok: boolean; error?: string }

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Unauthorized')
  return session.user.id
}

/** Rename a video the caller owns (title trimmed to 200 chars, non-empty). */
export async function renameVideoAction(videoId: string, title: string): Promise<ActionResult> {
  const userId = await requireUserId()
  const clean = title.trim().slice(0, 200)
  if (!clean) return { ok: false, error: 'Title cannot be empty' }
  const ok = await renameOwnedVideo(userId, videoId, clean)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : 'Video not found' }
}

/** Toggle a video the caller owns between public and private. */
export async function setVisibilityAction(
  videoId: string,
  isPublic: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const ok = await setOwnedVideoVisibility(userId, videoId, isPublic)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : 'Video not found' }
}
