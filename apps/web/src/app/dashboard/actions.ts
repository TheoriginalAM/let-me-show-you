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
import { setOwnedVideoExpiry } from '@/db/video-expiry'
import {
  EXPIRY_PRESET_DAYS,
  EXPIRY_REMINDER_LEAD_MS,
  expiryProblem,
  type ExpiryPresetDays,
} from '@/lib/link-expiry'
import { hashSharePassword } from '@/lib/share-password'

type ActionResult = { ok: boolean; error?: string }

/** Minimum share-password length. Short enough to be memorable, long enough to matter. */
const MIN_PASSWORD_LENGTH = 4

const NOT_FOUND = "Couldn't find that video. Refresh the page and try again."

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Unauthorized')
  return session.user.id
}

/** Rename a video the caller owns (title trimmed to 200 chars, non-empty). */
export async function renameVideoAction(videoId: string, title: string): Promise<ActionResult> {
  const userId = await requireUserId()
  const clean = title.trim().slice(0, 200)
  if (!clean) return { ok: false, error: 'Give the video a title.' }
  const ok = await renameOwnedVideo(userId, videoId, clean)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : NOT_FOUND }
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
  return { ok, error: ok ? undefined : NOT_FOUND }
}

/** Toggle the client approve/request-changes control on a video's share page. */
export async function setApprovalEnabledAction(
  videoId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const ok = await setVideoApprovalEnabled(userId, videoId, enabled)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : NOT_FOUND }
}

/** Toggle a video the caller owns between public and private. */
export async function setVisibilityAction(
  videoId: string,
  isPublic: boolean,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const ok = await setOwnedVideoVisibility(userId, videoId, isPublic)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : NOT_FOUND }
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
      return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
    }
    hash = hashSharePassword(password)
  }
  const ok = await setOwnedVideoPassword(userId, videoId, hash)
  revalidatePath('/dashboard')
  return { ok, error: ok ? undefined : NOT_FOUND }
}

/** What the dashboard's "Link expires" control asks for. */
export type ExpiryChoice =
  | { kind: 'never' }
  | { kind: 'days'; days: ExpiryPresetDays }
  /** `at` is the end of the chosen day in the person's own time zone. */
  | { kind: 'date'; at: string }

/**
 * Set when a video's share link stops working for viewers (or make it never
 * expire). Workspace-membership scoped. A new date gets a fresh reminder email,
 * unless it's already inside the reminder window: the person just chose it.
 */
export async function setVideoExpiryAction(
  videoId: string,
  choice: ExpiryChoice,
): Promise<ActionResult & { expiresAt?: string | null }> {
  const userId = await requireUserId()
  const now = Date.now()
  let at: number | null
  if (choice?.kind === 'never') {
    at = null
  } else if (choice?.kind === 'days') {
    if (!EXPIRY_PRESET_DAYS.includes(choice.days)) {
      return { ok: false, error: 'Choose how long the link should work.' }
    }
    at = now + choice.days * 24 * 60 * 60 * 1000
  } else if (choice?.kind === 'date') {
    at = Date.parse(String(choice.at ?? ''))
    const problem = expiryProblem(at, now)
    if (problem) return { ok: false, error: problem }
  } else {
    return { ok: false, error: 'Choose how long the link should work.' }
  }

  const expiresAt = at === null ? null : new Date(at).toISOString()
  const reminderSentAt =
    at !== null && at - now <= EXPIRY_REMINDER_LEAD_MS ? new Date(now).toISOString() : null
  const ok = await setOwnedVideoExpiry(userId, videoId, expiresAt, reminderSentAt)
  revalidatePath('/dashboard')
  return ok ? { ok, expiresAt } : { ok, error: NOT_FOUND }
}
