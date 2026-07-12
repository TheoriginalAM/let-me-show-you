'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import type { VideoStatus } from '@lmsy/shared'
import { buildShareUrl, SHARE_PATH } from '@lmsy/shared'
import {
  addVideoComment,
  countRecentCommentsByIp,
  countVideoCommentsSince,
  deleteOwnedVideoComment,
  getCommentContact,
  getVideoNotificationTarget,
  type PublicComment,
} from '@/db/comments'
import { createNotifications, memberIdsForVideo } from '@/db/app-notifications'
import { addApproval, countRecentApprovalsByIp } from '@/db/approvals'
import { notifyApproval, notifyCommentReply } from '@/lib/notifications'
import { getShareableVideoBySlug, recordVideoView } from '@/db/queries'
import { getCurrentUser } from '@/lib/current-user'
import { notifyOwnerOfComment } from '@/lib/notifications'
import {
  signUnlockToken,
  unlockCookieName,
  verifySharePassword,
  verifyUnlockToken,
} from '@/lib/share-password'

/** Comment field limits + anti-spam window (mirrored in the client form). */
const MAX_NAME = 60
const MAX_BODY = 2000
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX = 6
/** Collapse bursts: at most one owner email per video per this window. */
const EMAIL_DEBOUNCE_MS = 2 * 60 * 1000

/** How long an unlock cookie stays valid (7 days). */
const UNLOCK_MAX_AGE = 60 * 60 * 24 * 7

/**
 * True if the current request may view `video`: unprotected videos are always
 * viewable; protected ones require a valid unlock cookie for this exact
 * password hash. Keeps view-counting and status-polling honest for locked shares.
 */
async function isUnlocked(video: {
  id: string
  passwordHash: string | null
}): Promise<boolean> {
  if (!video.passwordHash) return true
  const token = (await cookies()).get(unlockCookieName(video.id))?.value
  return Boolean(token && verifyUnlockToken(token, video.id, video.passwordHash))
}

/**
 * Salted hash of the client IP for view debouncing. Returns null (fail closed)
 * rather than storing a weakly-salted hash when no salt is configured in prod.
 */
async function clientIpHash(): Promise<string | null> {
  const salt = process.env.VIEW_IP_SALT
  if (!salt) {
    // A missing/blank salt would make the stored hashes trivially reversible
    // (IPv4 is only 2^32), so never persist under it in production.
    if (process.env.NODE_ENV === 'production') {
      console.error('[views] VIEW_IP_SALT is not set — skipping view record')
      return null
    }
  }
  const h = await headers()
  const forwarded = h.get('x-forwarded-for') ?? ''
  // Use the RIGHTMOST forwarded hop — the address our trusted proxy (Railway)
  // appended — not the leftmost, which is attacker-supplied and spoofable.
  const hops = forwarded
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const ip = hops.length ? hops[hops.length - 1] : h.get('x-real-ip') || 'unknown'
  return createHash('sha256')
    .update(`${salt ?? 'lmsy-dev-salt'}:${ip}`)
    .digest('hex')
}

/**
 * Record a view for a share slug. Re-resolves the slug server-side (never trusts
 * a client-supplied id), only counts `ready` public videos, and is debounced to
 * one view per IP hash per hour inside the DAL.
 */
export async function recordShareView(slug: string): Promise<void> {
  const video = await getShareableVideoBySlug(slug)
  if (!video || video.status !== 'ready') return
  if (!(await isUnlocked(video))) return
  const ipHash = await clientIpHash()
  if (!ipHash) return
  await recordVideoView(video.id, ipHash)
}

/** Current status for a share slug, used by the "still processing" poller. */
export async function pollShareStatus(slug: string): Promise<VideoStatus | 'notfound'> {
  const video = await getShareableVideoBySlug(slug)
  // Don't leak a locked recording's status to someone who hasn't unlocked it.
  if (!video || !(await isUnlocked(video))) return 'notfound'
  return video.status
}

/**
 * Verify a share password and, on success, set an unlock cookie scoped to this
 * share's path. The cookie is bound to the current password hash, so it stops
 * working the instant the owner changes or clears the password.
 */
export async function unlockShare(slug: string, password: string): Promise<{ ok: boolean }> {
  const video = await getShareableVideoBySlug(slug)
  if (!video || !video.passwordHash) return { ok: false }
  if (!verifySharePassword(password, video.passwordHash)) return { ok: false }

  const cookieStore = await cookies()
  cookieStore.set(unlockCookieName(video.id), signUnlockToken(video.id, video.passwordHash), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/${SHARE_PATH}/${slug}`,
    maxAge: UNLOCK_MAX_AGE,
  })
  return { ok: true }
}

/**
 * Post a login-free comment to a share's public thread. Re-resolves the slug
 * server-side, requires the recording to be viewable (and unlocked, for
 * protected ones), validates + rate-limits by IP hash, and emails the owner
 * (best-effort, unless the owner posted it themselves).
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function postComment(
  slug: string,
  input: { name: string; email: string; body: string; parentId?: string; website?: string },
): Promise<{ ok: true; comment: PublicComment } | { ok: false; error: string }> {
  // Honeypot: real users never fill the hidden "website" field. Coerce first so a
  // non-string payload (array/object) can't slip past the check.
  if (input.website != null && String(input.website).trim() !== '') {
    return { ok: false, error: 'Unable to post your comment.' }
  }

  const name = String(input.name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME)
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 200)
  const body = String(input.body ?? '').trim().slice(0, MAX_BODY)
  const parentId = typeof input.parentId === 'string' && input.parentId ? input.parentId : null
  if (!name) return { ok: false, error: 'Please add your name.' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please add a valid email.' }
  if (!body) return { ok: false, error: 'Please write a comment.' }

  const video = await getShareableVideoBySlug(slug)
  if (!video || video.status === 'errored') {
    return { ok: false, error: 'This recording is unavailable.' }
  }
  if (!(await isUnlocked(video))) {
    return { ok: false, error: 'Unlock the recording before commenting.' }
  }

  const ipHash = await clientIpHash()
  const since = new Date(Date.now() - RATE_WINDOW_MS)
  if ((await countRecentCommentsByIp(video.id, ipHash, since)) >= RATE_MAX) {
    return { ok: false, error: "You're posting a little fast. Please try again in a few minutes." }
  }

  // A reply must point at a comment on THIS video; otherwise treat it as top-level.
  let replyTo: Awaited<ReturnType<typeof getCommentContact>> = null
  if (parentId) {
    replyTo = await getCommentContact(parentId)
    if (replyTo && replyTo.videoSlug !== slug) replyTo = null
  }
  const effectiveParent = replyTo ? parentId : null

  // Debounce the owner email BEFORE inserting: if this video already had a
  // comment in the last couple of minutes, the owner was just notified, so skip.
  const recentOnVideo = await countVideoCommentsSince(
    video.id,
    new Date(Date.now() - EMAIL_DEBOUNCE_MS),
  )

  const comment = await addVideoComment({
    videoId: video.id,
    authorName: name,
    authorEmail: email,
    body,
    parentId: effectiveParent,
    ipHash,
  })

  const me = await getCurrentUser()

  // In-app notifications for the video's workspace members (except the commenter).
  await createNotifications(
    (await memberIdsForVideo(video.id)).filter((id) => id !== me?.id),
    {
      type: 'comment',
      title: `New comment on ${video.title}`,
      body: `${name}: ${body.length > 120 ? `${body.slice(0, 120)}…` : body}`,
      linkPath: `/${SHARE_PATH}/${slug}`,
    },
  ).catch((error) => console.error('[comments] notification failed:', error))

  // Emails are awaited so they actually send (a fire-and-forget promise after the
  // action returns was not completing).
  if (replyTo?.authorEmail && replyTo.authorEmail !== email) {
    // A reply notifies the person being replied to.
    await notifyCommentReply({
      email: replyTo.authorEmail,
      replierName: name,
      videoTitle: replyTo.videoTitle,
      body,
      url: buildShareUrl(slug),
    }).catch((error) => console.error('[comments] reply notify failed:', error))
  } else if (!effectiveParent) {
    // A top-level comment notifies the owner (debounced, not self).
    const shouldEmail = ipHash !== null && recentOnVideo === 0 && me?.id !== video.ownerId
    if (shouldEmail) {
      const target = await getVideoNotificationTarget(video.id)
      if (target) {
        await notifyOwnerOfComment({
          ownerEmail: target.ownerEmail,
          videoTitle: target.title,
          authorName: name,
          body,
          shareUrl: buildShareUrl(slug),
        }).catch((error) => console.error('[comments] owner notify failed:', error))
      }
    }
  }

  revalidatePath(`/${SHARE_PATH}/${slug}`)
  // Never echo the email back to the client.
  return { ok: true, comment: { ...comment, authorEmail: null } }
}

/** Record a client approve / request-changes decision from the share page. */
export async function postApproval(
  slug: string,
  input: { name: string; email: string; status: 'approved' | 'changes'; note?: string },
): Promise<{ ok: boolean; error?: string }> {
  const name = String(input.name ?? '').trim().slice(0, MAX_NAME)
  const email = String(input.email ?? '').trim().toLowerCase().slice(0, 200)
  const status = input.status === 'approved' ? 'approved' : 'changes'
  const note = input.note && String(input.note).trim() ? String(input.note).trim().slice(0, 1000) : null
  if (!name) return { ok: false, error: 'Please add your name.' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please add a valid email.' }

  const video = await getShareableVideoBySlug(slug)
  if (!video || !video.approvalEnabled) return { ok: false, error: 'Approvals are not enabled here.' }
  if (!(await isUnlocked(video))) return { ok: false, error: 'Unlock the recording first.' }

  const ipHash = await clientIpHash()
  const since = new Date(Date.now() - RATE_WINDOW_MS)
  if ((await countRecentApprovalsByIp(video.id, ipHash, since)) >= 5) {
    return { ok: false, error: 'Too many submissions. Please try again shortly.' }
  }

  await addApproval({ videoId: video.id, name, email, status, note, ipHash })

  // Notify the workspace members in-app + email the owner (awaited).
  await createNotifications(await memberIdsForVideo(video.id), {
    type: 'approval',
    title:
      status === 'approved'
        ? `${name} approved ${video.title}`
        : `${name} requested changes on ${video.title}`,
    body: note ?? undefined,
    linkPath: `/${SHARE_PATH}/${slug}`,
  }).catch((error) => console.error('[approval] notification failed:', error))

  const target = await getVideoNotificationTarget(video.id)
  if (target) {
    await notifyApproval({
      ownerEmail: target.ownerEmail,
      approverName: name,
      status,
      videoTitle: target.title,
      note,
      url: buildShareUrl(slug),
    }).catch((error) => console.error('[approval] owner notify failed:', error))
  }

  revalidatePath(`/${SHARE_PATH}/${slug}`)
  return { ok: true }
}

/** Owner-only: remove a comment from one of their own videos' threads. */
export async function deleteComment(slug: string, commentId: string): Promise<{ ok: boolean }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false }
  const ok = await deleteOwnedVideoComment(me.id, commentId)
  if (ok) revalidatePath(`/${SHARE_PATH}/${slug}`)
  return { ok }
}
