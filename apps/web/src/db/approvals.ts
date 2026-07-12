import 'server-only'

import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from './index'
import { videoApprovals, videos, workspaceMembers } from './schema'

export interface Approval {
  id: string
  name: string
  email: string
  status: string
  note: string | null
  createdAt: string
}

function memberWorkspaceIds(userId: string) {
  return db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
}

/** Toggle the approval control on a video. Workspace-membership scoped. */
export async function setVideoApprovalEnabled(
  userId: string,
  videoId: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(videos)
    .set({ approvalEnabled: enabled })
    .where(and(eq(videos.id, videoId), inArray(videos.workspaceId, memberWorkspaceIds(userId))))
    .returning({ id: videos.id })
  return rows.length > 0
}

/** Record an approval decision from the share page. Caller has validated inputs. */
export async function addApproval(input: {
  videoId: string
  name: string
  email: string
  status: 'approved' | 'changes'
  note: string | null
  ipHash: string | null
}): Promise<void> {
  await db.insert(videoApprovals).values({
    videoId: input.videoId,
    name: input.name,
    email: input.email,
    status: input.status,
    note: input.note,
    authorIpHash: input.ipHash,
  })
}

/** All approval decisions on a video, newest first (owner-facing). */
export async function listApprovals(videoId: string): Promise<Approval[]> {
  return db
    .select({
      id: videoApprovals.id,
      name: videoApprovals.name,
      email: videoApprovals.email,
      status: videoApprovals.status,
      note: videoApprovals.note,
      createdAt: videoApprovals.createdAt,
    })
    .from(videoApprovals)
    .where(eq(videoApprovals.videoId, videoId))
    .orderBy(desc(videoApprovals.createdAt))
}

/** Per-video approval tallies for a set of videos (dashboard badges). */
export async function approvalCountsByVideo(
  videoIds: string[],
): Promise<Record<string, { approved: number; changes: number }>> {
  if (videoIds.length === 0) return {}
  const rows = await db
    .select({
      videoId: videoApprovals.videoId,
      approved: sql<number>`count(*) filter (where ${videoApprovals.status} = 'approved')`,
      changes: sql<number>`count(*) filter (where ${videoApprovals.status} = 'changes')`,
    })
    .from(videoApprovals)
    .where(inArray(videoApprovals.videoId, videoIds))
    .groupBy(videoApprovals.videoId)
  const out: Record<string, { approved: number; changes: number }> = {}
  for (const r of rows) out[r.videoId] = { approved: Number(r.approved), changes: Number(r.changes) }
  return out
}

/** How many approvals this IP made on this video recently (rate limit). */
export async function countRecentApprovalsByIp(
  videoId: string,
  ipHash: string | null,
  since: Date,
): Promise<number> {
  if (!ipHash) return 0
  const rows = await db
    .select({ n: count() })
    .from(videoApprovals)
    .where(
      and(
        eq(videoApprovals.videoId, videoId),
        eq(videoApprovals.authorIpHash, ipHash),
        sql`${videoApprovals.createdAt} > ${since.toISOString()}`,
      ),
    )
  return Number(rows[0]?.n ?? 0)
}
