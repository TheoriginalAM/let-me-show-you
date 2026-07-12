import 'server-only'

import { and, count, desc, eq } from 'drizzle-orm'
import { db } from './index'
import { notifications, videos, workspaceMembers } from './schema'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  linkPath: string | null
  read: boolean
  createdAt: string
}

/** Insert a notification for each recipient (deduped; no-op if empty). */
export async function createNotifications(
  userIds: string[],
  input: { type: string; title: string; body?: string | null; linkPath?: string | null },
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean)
  if (unique.length === 0) return
  await db.insert(notifications).values(
    unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
    })),
  )
}

export async function listNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      linkPath: notifications.linkPath,
      read: notifications.read,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
  return Number(rows[0]?.n ?? 0)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
}

/** User ids of everyone who can see a video (members of its workspace). */
export async function memberIdsForVideo(videoId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(videos)
    .innerJoin(workspaceMembers, eq(videos.workspaceId, workspaceMembers.workspaceId))
    .where(eq(videos.id, videoId))
  return rows.map((r) => r.userId)
}

/** User ids of a workspace's owners. */
export async function ownerIdsForWorkspace(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')))
  return rows.map((r) => r.userId)
}
