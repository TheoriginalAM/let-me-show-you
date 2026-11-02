import 'server-only'

import { and, count, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from './index'
import type { ReportReason } from '../lib/report-reasons'
import { videoReports, videos, workspaces } from './schema'

/** Store a report from a share page. The caller has validated the input. */
export async function addVideoReport(input: {
  videoId: string
  reason: ReportReason
  details: string | null
  reporterEmail: string | null
  reporterIpHash: string | null
}): Promise<void> {
  await db.insert(videoReports).values(input)
}

/** Reports sent from this (hashed) IP since `since`, across every link. */
export async function countRecentReportsByIp(ipHash: string, since: Date): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(videoReports)
    .where(
      and(eq(videoReports.reporterIpHash, ipHash), gt(videoReports.createdAt, since.toISOString())),
    )
  return Number(rows[0]?.value ?? 0)
}

/** Reports on one video since `since` (to avoid emailing admins about every one). */
export async function countRecentReportsForVideo(videoId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(videoReports)
    .where(and(eq(videoReports.videoId, videoId), gt(videoReports.createdAt, since.toISOString())))
  return Number(rows[0]?.value ?? 0)
}

export interface OpenReport {
  id: string
  reason: string
  details: string | null
  reporterEmail: string | null
  createdAt: string
  videoId: string
  videoTitle: string
  shareSlug: string
  isPublic: boolean
  businessName: string
}

/** Reports nobody has dealt with yet, newest first (admin only). */
export async function listOpenReports(limit = 100): Promise<OpenReport[]> {
  const rows = await db
    .select({
      id: videoReports.id,
      reason: videoReports.reason,
      details: videoReports.details,
      reporterEmail: videoReports.reporterEmail,
      createdAt: videoReports.createdAt,
      videoId: videos.id,
      videoTitle: videos.title,
      shareSlug: videos.shareSlug,
      isPublic: videos.isPublic,
      workspaceName: workspaces.name,
      brandName: workspaces.brandName,
    })
    .from(videoReports)
    .innerJoin(videos, eq(videoReports.videoId, videos.id))
    .innerJoin(workspaces, eq(videos.workspaceId, workspaces.id))
    .where(isNull(videoReports.resolvedAt))
    .orderBy(desc(videoReports.createdAt))
    .limit(limit)
  return rows.map(({ workspaceName, brandName, ...r }) => ({
    ...r,
    businessName: brandName || workspaceName,
  }))
}

/** Mark one report as dealt with. Returns whether it was still open. */
export async function resolveReport(reportId: string): Promise<boolean> {
  const rows = await db
    .update(videoReports)
    .set({ resolvedAt: new Date().toISOString() })
    .where(and(eq(videoReports.id, reportId), isNull(videoReports.resolvedAt)))
    .returning({ id: videoReports.id })
  return rows.length > 0
}

/**
 * Take a reported video's link down: make the video private and resolve every
 * open report on it (they're all about the same link). Returns whether the
 * report existed.
 */
export async function makeReportedVideoPrivate(reportId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({ videoId: videoReports.videoId })
      .from(videoReports)
      .where(eq(videoReports.id, reportId))
      .limit(1)
    if (!report) return false
    await tx.update(videos).set({ isPublic: false }).where(eq(videos.id, report.videoId))
    await tx
      .update(videoReports)
      .set({ resolvedAt: new Date().toISOString() })
      .where(and(eq(videoReports.videoId, report.videoId), isNull(videoReports.resolvedAt)))
    return true
  })
}
