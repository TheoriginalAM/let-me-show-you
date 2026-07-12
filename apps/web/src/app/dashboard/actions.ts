'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  renameOwnedVideo,
  setOwnedVideoDescription,
  setOwnedVideoPassword,
  setOwnedVideoVisibility,
} from '@/db/queries'
import { setVideoApprovalEnabled } from '@/db/approvals'
import { hashSharePassword } from '@/lib/share-password'

type ActionResult = { ok: boolean; error?: string }

/** Minimum share-password length. Short enough to be memorable, long enough to matter. */
const MIN_PASSWORD_LENGTH = 4

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

/** Set (or clear) a video's description. Workspace-membership scoped. */
export async function setDescriptionAction(
  videoId: string,
  description: string | null,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const clean = description && description.trim() ? description.trim().slice(0, 2000) : null
  const ok = await setOwnedVideoDescription(userId, videoId, clean)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : 'Video not found' }
}

/** Toggle the client approve/request-changes control on a video's share page. */
export async function setApprovalEnabledAction(
  videoId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const ok = await setVideoApprovalEnabled(userId, videoId, enabled)
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

/**
 * Set (or, with `password: null`, clear) the share password on a video the
 * caller owns. The password is hashed server-side before it ever touches the DB.
 */
export async function setVideoPasswordAction(
  videoId: string,
  password: string | null,
): Promise<ActionResult> {
  const userId = await requireUserId()
  let hash: string | null = null
  if (password !== null) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters` }
    }
    hash = hashSharePassword(password)
  }
  const ok = await setOwnedVideoPassword(userId, videoId, hash)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : 'Video not found' }
}
