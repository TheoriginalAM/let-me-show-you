import 'server-only'

import { and, asc, count, eq, gt, inArray } from 'drizzle-orm'
import { db } from './index'
import { user, videoComments, videos, workspaceMembers } from './schema'

/** A comment as shown in the public thread (no IP hash, no internals). */
export interface PublicComment {
  id: string
  authorName: string
  body: string
  createdAt: string
}

/** All comments for a video, oldest-first (chat order). */
export async function listVideoComments(videoId: string): Promise<PublicComment[]> {
  return db
    .select({
      id: videoComments.id,
      authorName: videoComments.authorName,
      body: videoComments.body,
      createdAt: videoComments.createdAt,
    })
    .from(videoComments)
    .where(eq(videoComments.videoId, videoId))
    .orderBy(asc(videoComments.createdAt))
}

/** Insert a comment and return its public shape. Caller has already validated. */
export async function addVideoComment(input: {
  videoId: string
  authorName: string
  body: string
  ipHash: string | null
}): Promise<PublicComment> {
  const rows = await db
    .insert(videoComments)
    .values({
      videoId: input.videoId,
      authorName: input.authorName,
      body: input.body,
      authorIpHash: input.ipHash,
    })
    .returning({
      id: videoComments.id,
      authorName: videoComments.authorName,
      body: videoComments.body,
      createdAt: videoComments.createdAt,
    })
  return rows[0]!
}

/**
 * How many comments this IP hash has posted to this video since `since`. Used to
 * rate-limit anonymous posting. A null hash returns 0 so it never blocks — the
 * missing-salt case is handled by the caller.
 */
export async function countRecentCommentsByIp(
  videoId: string,
  ipHash: string | null,
  since: Date,
): Promise<number> {
  if (!ipHash) return 0
  const rows = await db
    .select({ value: count() })
    .from(videoComments)
    .where(
      and(
        eq(videoComments.videoId, videoId),
        eq(videoComments.authorIpHash, ipHash),
        gt(videoComments.createdAt, since.toISOString()),
      ),
    )
  return Number(rows[0]?.value ?? 0)
}

/**
 * How many comments this video has received since `since`, from anyone. Used to
 * debounce owner notification emails so a burst can't email-bomb the owner.
 */
export async function countVideoCommentsSince(videoId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(videoComments)
    .where(and(eq(videoComments.videoId, videoId), gt(videoComments.createdAt, since.toISOString())))
  return Number(rows[0]?.value ?? 0)
}

/**
 * Delete a comment, but only if `userId` is a member of the workspace that owns
 * the comment's video (a join guard so moderation can't touch other teams'
 * threads). Returns whether a row was deleted.
 */
export async function deleteOwnedVideoComment(
  userId: string,
  commentId: string,
): Promise<boolean> {
  const owned = await db
    .select({ id: videoComments.id })
    .from(videoComments)
    .innerJoin(videos, eq(videoComments.videoId, videos.id))
    .innerJoin(workspaceMembers, eq(videos.workspaceId, workspaceMembers.workspaceId))
    .where(and(eq(videoComments.id, commentId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  if (owned.length === 0) return false
  await db.delete(videoComments).where(eq(videoComments.id, commentId))
  return true
}

/** Owner email + video title for a new-comment notification. Null if missing. */
export async function getVideoNotificationTarget(
  videoId: string,
): Promise<{ ownerEmail: string; ownerName: string; title: string } | null> {
  const rows = await db
    .select({ ownerEmail: user.email, ownerName: user.name, title: videos.title })
    .from(videos)
    .innerJoin(user, eq(videos.ownerId, user.id))
    .where(eq(videos.id, videoId))
    .limit(1)
  return rows[0] ?? null
}

/** Comment counts keyed by video id, for a set of the owner's videos (dashboard). */
export async function commentCountsByVideo(videoIds: string[]): Promise<Record<string, number>> {
  if (videoIds.length === 0) return {}
  const rows = await db
    .select({ videoId: videoComments.videoId, value: count() })
    .from(videoComments)
    .where(inArray(videoComments.videoId, videoIds))
    .groupBy(videoComments.videoId)
  const out: Record<string, number> = {}
  for (const r of rows) out[r.videoId] = Number(r.value)
  return out
}
