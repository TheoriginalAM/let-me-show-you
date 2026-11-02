import 'server-only'

import { and, asc, count, eq, gt, lt, sql } from 'drizzle-orm'
import { isReaction, REACTIONS, type Reaction } from '@/lib/video-notes'
import { db } from './index'
import { videoReactions } from './schema'

/** How many times one emoji was left at one second of the video. */
export interface ReactionMoment {
  atSeconds: number
  emoji: Reaction
  count: number
}

/** Totals per emoji plus where they were left, for the share page. */
export interface VideoReactions {
  counts: Record<Reaction, number>
  moments: ReactionMoment[]
}

/** Every reaction on a video, grouped by second and emoji (earliest moment first). */
export async function getVideoReactions(videoId: string): Promise<VideoReactions> {
  const rows = await db
    .select({
      atSeconds: videoReactions.atSeconds,
      emoji: videoReactions.emoji,
      value: count(),
    })
    .from(videoReactions)
    .where(eq(videoReactions.videoId, videoId))
    .groupBy(videoReactions.atSeconds, videoReactions.emoji)
    .orderBy(asc(videoReactions.atSeconds))

  const counts = Object.fromEntries(REACTIONS.map((r) => [r, 0])) as Record<Reaction, number>
  const moments: ReactionMoment[] = []
  for (const r of rows) {
    // Skip anything that's no longer one of the offered emoji.
    if (!isReaction(r.emoji)) continue
    const n = Number(r.value)
    counts[r.emoji] += n
    moments.push({ atSeconds: r.atSeconds, emoji: r.emoji, count: n })
  }
  return { counts, moments }
}

export type AddReactionResult = 'added' | 'repeat' | 'limited'

/**
 * Record a reaction unless it repeats one this viewer already left nearby, or the
 * viewer (by key or by IP hash) is over the hourly cap. Taps from one viewer go
 * through one at a time (advisory lock), so a double tap can't count twice.
 * Caller has already validated the emoji, the moment and access to the video.
 */
export async function addVideoReaction(input: {
  videoId: string
  emoji: Reaction
  atSeconds: number
  viewerKey: string
  ipHash: string | null
  /** Same viewer + emoji closer than this many seconds of video time is a repeat. */
  repeatWindow: number
  since: Date
  maxPerViewer: number
  maxPerIp: number
}): Promise<AddReactionResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`reaction:${input.videoId}:${input.viewerKey}`}))`,
    )

    const repeat = await tx
      .select({ id: videoReactions.id })
      .from(videoReactions)
      .where(
        and(
          eq(videoReactions.videoId, input.videoId),
          eq(videoReactions.viewerKey, input.viewerKey),
          eq(videoReactions.emoji, input.emoji),
          gt(videoReactions.atSeconds, input.atSeconds - input.repeatWindow),
          lt(videoReactions.atSeconds, input.atSeconds + input.repeatWindow),
        ),
      )
      .limit(1)
    if (repeat.length > 0) return 'repeat'

    const since = input.since.toISOString()
    const byViewer = await tx
      .select({ value: count() })
      .from(videoReactions)
      .where(
        and(
          eq(videoReactions.videoId, input.videoId),
          eq(videoReactions.viewerKey, input.viewerKey),
          gt(videoReactions.createdAt, since),
        ),
      )
    if (Number(byViewer[0]?.value ?? 0) >= input.maxPerViewer) return 'limited'

    // A null hash (no salt configured) can't be grouped, so only the key cap applies.
    if (input.ipHash) {
      const byIp = await tx
        .select({ value: count() })
        .from(videoReactions)
        .where(
          and(
            eq(videoReactions.videoId, input.videoId),
            eq(videoReactions.viewerIpHash, input.ipHash),
            gt(videoReactions.createdAt, since),
          ),
        )
      if (Number(byIp[0]?.value ?? 0) >= input.maxPerIp) return 'limited'
    }

    await tx.insert(videoReactions).values({
      videoId: input.videoId,
      emoji: input.emoji,
      atSeconds: input.atSeconds,
      viewerKey: input.viewerKey,
      viewerIpHash: input.ipHash,
    })
    return 'added'
  })
}
