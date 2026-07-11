import 'server-only'

import { and, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm'
import type { PublicVideo, Video } from '@lmsy/shared'
import { db } from './index'
import { user, videos, videoViews } from './schema'

/** A video plus its total view count (dashboard rows). */
export type VideoWithViews = Video & { viewCount: number }

/**
 * Data-access layer for videos.
 *
 * SECURITY: every owner-scoped query takes the authenticated `ownerId` as its
 * first argument and filters on `videos.ownerId`. Callers (API routes, server
 * components, server actions) must pass the id from the verified session — never
 * an id supplied by the client.
 */

// Owner-safe projection: everything except `password_hash`.
const ownerVideoColumns = {
  id: videos.id,
  ownerId: videos.ownerId,
  title: videos.title,
  status: videos.status,
  muxAssetId: videos.muxAssetId,
  muxPlaybackId: videos.muxPlaybackId,
  durationSeconds: videos.durationSeconds,
  shareSlug: videos.shareSlug,
  isPublic: videos.isPublic,
  createdAt: videos.createdAt,
}

/** All videos owned by `ownerId`, newest first. */
export async function listVideosByOwner(ownerId: string): Promise<Video[]> {
  return db
    .select(ownerVideoColumns)
    .from(videos)
    .where(eq(videos.ownerId, ownerId))
    .orderBy(desc(videos.createdAt))
}

/** A single video, returned only if it belongs to `ownerId`. */
export async function getOwnedVideo(ownerId: string, videoId: string): Promise<Video | null> {
  const rows = await db
    .select(ownerVideoColumns)
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.ownerId, ownerId)))
    .limit(1)
  return rows[0] ?? null
}

/** View count for a video the caller owns (ownership enforced via the join). */
export async function getOwnedVideoViewCount(ownerId: string, videoId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(videoViews)
    .innerJoin(videos, eq(videoViews.videoId, videos.id))
    .where(and(eq(videos.id, videoId), eq(videos.ownerId, ownerId)))
  return rows[0]?.value ?? 0
}

/**
 * Public share-link lookup. Returns a video when it is public, NOT
 * password-protected, and in a viewable state (`ready`, or still
 * `processing`/`uploading` so the share page can show a "still processing"
 * state). Never exposes the owner id or any secret column; the owner's display
 * name and creation date ARE included as they are shown publicly on the page.
 * Password-protected shares must go through a dedicated password-verified path.
 */
export async function getVideoBySlug(slug: string): Promise<PublicVideo | null> {
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      status: videos.status,
      muxPlaybackId: videos.muxPlaybackId,
      durationSeconds: videos.durationSeconds,
      shareSlug: videos.shareSlug,
      ownerName: user.name,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .innerJoin(user, eq(videos.ownerId, user.id))
    .where(
      and(
        eq(videos.shareSlug, slug),
        inArray(videos.status, ['ready', 'processing', 'uploading']),
        eq(videos.isPublic, true),
        isNull(videos.passwordHash),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * Total public view count for a video, keyed by id. Not owner-scoped: callers
 * must have already resolved the id from a public slug (i.e. the video is
 * public). Used by the public share page.
 */
export async function getPublicVideoViewCount(videoId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(videoViews)
    .where(eq(videoViews.videoId, videoId))
  return Number(rows[0]?.value ?? 0)
}

/**
 * Record a view, debounced to at most one per IP hash per hour. Returns whether
 * a new row was inserted. `ipHash` must already be salted+hashed by the caller.
 */
export async function recordVideoView(videoId: string, ipHash: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await db
    .select({ id: videoViews.id })
    .from(videoViews)
    .where(
      and(
        eq(videoViews.videoId, videoId),
        eq(videoViews.viewerIpHash, ipHash),
        gt(videoViews.viewedAt, oneHourAgo),
      ),
    )
    .limit(1)
  if (recent.length > 0) return false
  await db.insert(videoViews).values({ videoId, viewerIpHash: ipHash })
  return true
}

/** All of an owner's videos with their view counts, newest first (dashboard). */
export async function listVideosByOwnerWithViews(ownerId: string): Promise<VideoWithViews[]> {
  const rows = await db
    .select({ ...ownerVideoColumns, viewCount: count(videoViews.id) })
    .from(videos)
    .leftJoin(videoViews, eq(videoViews.videoId, videos.id))
    .where(eq(videos.ownerId, ownerId))
    .groupBy(videos.id)
    .orderBy(desc(videos.createdAt))
  return rows.map((row) => ({ ...row, viewCount: Number(row.viewCount) }))
}

/** Rename a video the caller owns. Returns whether a row was updated. */
export async function renameOwnedVideo(
  ownerId: string,
  videoId: string,
  title: string,
): Promise<boolean> {
  const rows = await db
    .update(videos)
    .set({ title })
    .where(and(eq(videos.id, videoId), eq(videos.ownerId, ownerId)))
    .returning({ id: videos.id })
  return rows.length > 0
}

/** Toggle a video's public/private flag. Returns whether a row was updated. */
export async function setOwnedVideoVisibility(
  ownerId: string,
  videoId: string,
  isPublic: boolean,
): Promise<boolean> {
  const rows = await db
    .update(videos)
    .set({ isPublic })
    .where(and(eq(videos.id, videoId), eq(videos.ownerId, ownerId)))
    .returning({ id: videos.id })
  return rows.length > 0
}

/** Slugs + timestamps of all public, ready videos — for the sitemap. */
export async function listPublicVideoSlugs(
  limit = 5000,
): Promise<{ slug: string; createdAt: string }[]> {
  return db
    .select({ slug: videos.shareSlug, createdAt: videos.createdAt })
    .from(videos)
    .where(and(eq(videos.status, 'ready'), eq(videos.isPublic, true), isNull(videos.passwordHash)))
    .orderBy(desc(videos.createdAt))
    .limit(limit)
}

/**
 * Create an `uploading` video row for the authenticated owner, retrying on the
 * (astronomically rare) share-slug collision with a fresh slug.
 */
export async function createVideoForUpload(
  ownerId: string,
  title: string,
  makeSlug: () => string,
): Promise<Video> {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await db
        .insert(videos)
        .values({ ownerId, title, shareSlug: makeSlug(), status: 'uploading' })
        .returning(ownerVideoColumns)
      return rows[0]!
    } catch (error) {
      // 23505 = unique_violation (slug clash) → retry; anything else is fatal.
      if ((error as { code?: string })?.code !== '23505') throw error
      lastError = error
    }
  }
  throw lastError
}

/** Delete an owner's video (used to roll back a failed upload creation). */
export async function deleteOwnedVideo(ownerId: string, videoId: string): Promise<void> {
  await db.delete(videos).where(and(eq(videos.id, videoId), eq(videos.ownerId, ownerId)))
}

/**
 * WEBHOOK-ONLY status updates, keyed by videoId taken from a signature-verified
 * Mux `passthrough`. These are intentionally NOT owner-scoped — never call them
 * from user-facing routes.
 */
export async function markVideoProcessing(videoId: string, muxAssetId: string): Promise<void> {
  await db.update(videos).set({ status: 'processing', muxAssetId }).where(eq(videos.id, videoId))
}

export async function markVideoReady(
  videoId: string,
  muxPlaybackId: string,
  durationSeconds: number | null,
): Promise<void> {
  await db
    .update(videos)
    .set({ status: 'ready', muxPlaybackId, durationSeconds })
    .where(eq(videos.id, videoId))
}

export async function markVideoErrored(videoId: string): Promise<void> {
  await db.update(videos).set({ status: 'errored' }).where(eq(videos.id, videoId))
}
