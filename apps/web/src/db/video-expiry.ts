import 'server-only'

import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm'
import { db } from './index'
import { user, videos, workspaceMembers, workspaces } from './schema'

function memberWorkspaceIds(userId: string) {
  return db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
}

/**
 * Set (or, with null, clear) when a video's share link expires. Workspace
 * membership scoped. `reminderSentAt` is stored with it: null so the owner is
 * reminded about the new date, or a time when no reminder should go out.
 */
export async function setOwnedVideoExpiry(
  userId: string,
  videoId: string,
  expiresAt: string | null,
  reminderSentAt: string | null,
): Promise<boolean> {
  const rows = await db
    .update(videos)
    .set({ expiresAt, expiryReminderSentAt: reminderSentAt })
    .where(and(eq(videos.id, videoId), inArray(videos.workspaceId, memberWorkspaceIds(userId))))
    .returning({ id: videos.id })
  return rows.length > 0
}

/**
 * Atomically claim the public links that expire within `leadMs` and haven't
 * had their reminder yet, by stamping `expiryReminderSentAt`. A second process
 * (or a restart mid-sweep) can't claim the same row twice.
 */
export async function claimDueExpiryReminders(
  leadMs: number,
  now = Date.now(),
): Promise<{ ids: string[]; claimedAt: string }> {
  const claimedAt = new Date(now).toISOString()
  const rows = await db
    .update(videos)
    .set({ expiryReminderSentAt: claimedAt })
    .where(
      and(
        isNull(videos.expiryReminderSentAt),
        eq(videos.isPublic, true),
        gt(videos.expiresAt, claimedAt),
        lte(videos.expiresAt, new Date(now + leadMs).toISOString()),
      ),
    )
    .returning({ id: videos.id })
  return { ids: rows.map((r) => r.id), claimedAt }
}

/** Undo a claim whose email failed, so the next sweep tries again. */
export async function releaseExpiryReminderClaim(id: string, claimedAt: string): Promise<void> {
  await db
    .update(videos)
    .set({ expiryReminderSentAt: null })
    .where(and(eq(videos.id, id), eq(videos.expiryReminderSentAt, claimedAt)))
}

export interface ExpiryReminderTarget {
  title: string
  shareSlug: string
  expiresAt: string
  ownerName: string
  ownerEmail: string
  workspaceName: string
}

/** Who to email about a video's link expiring, and what to tell them. */
export async function getExpiryReminderTarget(
  videoId: string,
): Promise<ExpiryReminderTarget | null> {
  const rows = await db
    .select({
      title: videos.title,
      shareSlug: videos.shareSlug,
      expiresAt: videos.expiresAt,
      ownerName: user.name,
      ownerEmail: user.email,
      workspaceName: workspaces.name,
      brandName: workspaces.brandName,
    })
    .from(videos)
    .innerJoin(user, eq(videos.ownerId, user.id))
    .innerJoin(workspaces, eq(videos.workspaceId, workspaces.id))
    .where(eq(videos.id, videoId))
    .limit(1)
  const row = rows[0]
  if (!row?.expiresAt) return null
  const { brandName, ...rest } = row
  return {
    ...rest,
    expiresAt: row.expiresAt,
    workspaceName: brandName || row.workspaceName,
  }
}
