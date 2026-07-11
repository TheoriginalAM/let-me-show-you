import 'server-only'

import { and, count, desc, eq, isNull } from 'drizzle-orm'
import type { PublicVideo, Video } from '@lmsy/shared'
import { db } from './index'
import { videos, videoViews } from './schema'

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
 * Public share-link lookup. Returns a video ONLY when it is `ready`, public, and
 * NOT password-protected, and never exposes the owner id or any secret column.
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
    })
    .from(videos)
    .where(
      and(
        eq(videos.shareSlug, slug),
        eq(videos.status, 'ready'),
        eq(videos.isPublic, true),
        isNull(videos.passwordHash),
      ),
    )
    .limit(1)
  return rows[0] ?? null
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
