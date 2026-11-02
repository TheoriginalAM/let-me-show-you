import 'server-only'

import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from './index'
import { user, videoDocuments, videos, workspaces } from './schema'
import type { Chapter, DocumentKind, TranscriptCue } from '../lib/video-notes'

// ---------------------------------------------------------------------------
// Transcripts and AI notes on the video itself
// ---------------------------------------------------------------------------

/** What the transcript pipeline needs to know about a video. */
export interface TranscriptTarget {
  id: string
  muxAssetId: string | null
  muxPlaybackId: string | null
  status: string
  transcriptStatus: string | null
  transcriptTrackId: string | null
}

export async function getTranscriptTarget(videoId: string): Promise<TranscriptTarget | null> {
  const rows = await db
    .select({
      id: videos.id,
      muxAssetId: videos.muxAssetId,
      muxPlaybackId: videos.muxPlaybackId,
      status: videos.status,
      transcriptStatus: videos.transcriptStatus,
      transcriptTrackId: videos.transcriptTrackId,
    })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1)
  return rows[0] ?? null
}

/** The video a Mux asset belongs to (track webhooks carry only the asset id). */
export async function getTranscriptTargetByAsset(
  muxAssetId: string,
): Promise<TranscriptTarget | null> {
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.muxAssetId, muxAssetId))
    .limit(1)
  return rows[0] ? getTranscriptTarget(rows[0].id) : null
}

/** Takes the job of starting a transcript, so two webhooks can't both ask Mux. */
export async function claimTranscript(videoId: string): Promise<boolean> {
  const rows = await db
    .update(videos)
    .set({ transcriptStatus: 'pending' })
    .where(
      and(
        eq(videos.id, videoId),
        or(isNull(videos.transcriptStatus), eq(videos.transcriptStatus, 'failed')),
      ),
    )
    .returning({ id: videos.id })
  return rows.length > 0
}

export async function setTranscriptState(
  videoId: string,
  state: { status: 'pending' | 'failed' | 'none'; trackId?: string | null },
): Promise<void> {
  await db
    .update(videos)
    .set({
      transcriptStatus: state.status,
      ...(state.trackId !== undefined ? { transcriptTrackId: state.trackId } : {}),
    })
    .where(eq(videos.id, videoId))
}

export async function saveTranscript(
  videoId: string,
  trackId: string,
  cues: TranscriptCue[],
): Promise<void> {
  await db
    .update(videos)
    .set({
      transcriptStatus: cues.length ? 'ready' : 'none',
      transcriptTrackId: trackId,
      transcript: cues,
    })
    .where(eq(videos.id, videoId))
}

/**
 * Takes the job of writing a video's summary and chapters. Atomic, so a retried
 * webhook and a button press can't both run it; a stale 'pending' (a crash
 * mid-write) can be retaken after 10 minutes.
 */
export async function claimNotes(videoId: string): Promise<boolean> {
  const rows = await db.execute<{ id: string }>(sql`
    update ${videos}
    set notes_status = 'pending', notes_claimed_at = now()
    where id = ${videoId}
      and transcript_status = 'ready'
      and (notes_status is distinct from 'pending' or notes_claimed_at < now() - interval '10 minutes')
    returning id
  `)
  return rows.length > 0
}

export async function saveNotes(
  videoId: string,
  notes: { summary: string; chapters: Chapter[] } | null,
): Promise<void> {
  await db
    .update(videos)
    .set(
      notes
        ? { notesStatus: 'ready', summary: notes.summary, chapters: notes.chapters }
        : { notesStatus: 'failed' },
    )
    .where(eq(videos.id, videoId))
}

/** Everything the AI writer reads about a recording. */
export interface NotesSource {
  id: string
  title: string
  description: string | null
  durationSeconds: number | null
  muxPlaybackId: string | null
  shareSlug: string
  transcript: TranscriptCue[]
  ownerName: string
  businessName: string
}

export async function getNotesSource(videoId: string): Promise<NotesSource | null> {
  const rows = await db
    .select({
      id: videos.id,
      title: videos.title,
      description: videos.description,
      durationSeconds: videos.durationSeconds,
      muxPlaybackId: videos.muxPlaybackId,
      shareSlug: videos.shareSlug,
      transcript: videos.transcript,
      ownerName: user.name,
      workspaceName: workspaces.name,
      brandName: workspaces.brandName,
    })
    .from(videos)
    .innerJoin(user, eq(videos.ownerId, user.id))
    .innerJoin(workspaces, eq(videos.workspaceId, workspaces.id))
    .where(eq(videos.id, videoId))
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    durationSeconds: r.durationSeconds,
    muxPlaybackId: r.muxPlaybackId,
    shareSlug: r.shareSlug,
    transcript: r.transcript ?? [],
    ownerName: r.ownerName,
    businessName: r.brandName || r.workspaceName,
  }
}

// ---------------------------------------------------------------------------
// Write-ups (video_documents)
// ---------------------------------------------------------------------------

export interface VideoDocument {
  id: string
  videoId: string
  kind: DocumentKind
  title: string
  markdown: string
  instructions: string | null
  status: 'pending' | 'ready' | 'failed'
  error: string | null
  published: boolean
  createdAt: string
  updatedAt: string
}

const documentColumns = {
  id: videoDocuments.id,
  videoId: videoDocuments.videoId,
  kind: videoDocuments.kind,
  title: videoDocuments.title,
  markdown: videoDocuments.markdown,
  instructions: videoDocuments.instructions,
  status: videoDocuments.status,
  error: videoDocuments.error,
  published: videoDocuments.published,
  createdAt: videoDocuments.createdAt,
  updatedAt: videoDocuments.updatedAt,
}

/** A video's write-ups, oldest first. Viewers only get the published, finished ones. */
export async function listVideoDocuments(
  videoId: string,
  opts: { drafts: boolean },
): Promise<VideoDocument[]> {
  if (opts.drafts) await failStaleDocuments(videoId)
  const rows = await db
    .select(documentColumns)
    .from(videoDocuments)
    .where(
      opts.drafts
        ? eq(videoDocuments.videoId, videoId)
        : and(
            eq(videoDocuments.videoId, videoId),
            eq(videoDocuments.published, true),
            eq(videoDocuments.status, 'ready'),
          ),
    )
    .orderBy(asc(videoDocuments.createdAt))
  return rows as VideoDocument[]
}

export async function getVideoDocument(id: string): Promise<VideoDocument | null> {
  const rows = await db
    .select(documentColumns)
    .from(videoDocuments)
    .where(eq(videoDocuments.id, id))
    .limit(1)
  return (rows[0] as VideoDocument | undefined) ?? null
}

export async function createVideoDocument(input: {
  videoId: string
  kind: DocumentKind
  title: string
  instructions: string | null
  createdBy: string
}): Promise<string> {
  const [row] = await db
    .insert(videoDocuments)
    .values({ ...input, status: 'pending' })
    .returning({ id: videoDocuments.id })
  return row!.id
}

export async function finishVideoDocument(
  id: string,
  result: { title: string; markdown: string } | { error: string },
): Promise<void> {
  await db
    .update(videoDocuments)
    .set(
      'error' in result
        ? { status: 'failed', error: result.error, updatedAt: sql`now()` }
        : {
            status: 'ready',
            error: null,
            title: result.title,
            markdown: result.markdown,
            updatedAt: sql`now()`,
          },
    )
    .where(eq(videoDocuments.id, id))
}

export async function updateVideoDocument(
  id: string,
  patch: { title?: string; markdown?: string; published?: boolean },
): Promise<void> {
  await db
    .update(videoDocuments)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(and(eq(videoDocuments.id, id), ne(videoDocuments.status, 'pending')))
}

/** Puts a failed write-up back in the queue. */
export async function restartVideoDocument(id: string): Promise<void> {
  await db
    .update(videoDocuments)
    .set({ status: 'pending', error: null, updatedAt: sql`now()` })
    .where(eq(videoDocuments.id, id))
}

export async function deleteVideoDocument(id: string): Promise<void> {
  await db.delete(videoDocuments).where(eq(videoDocuments.id, id))
}

/** How many write-ups a video has had made in the last hour (a soft spend limit). */
export async function recentDocumentCount(videoId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(videoDocuments)
    .where(
      and(
        eq(videoDocuments.videoId, videoId),
        sql`${videoDocuments.createdAt} > now() - interval '1 hour'`,
      ),
    )
  return rows[0]?.n ?? 0
}

/** Write-ups stuck in 'pending' (the server restarted mid-write) count as failed. */
export async function failStaleDocuments(videoId: string): Promise<void> {
  await db
    .update(videoDocuments)
    .set({ status: 'failed', error: 'This took too long. Try again.' })
    .where(
      and(
        eq(videoDocuments.videoId, videoId),
        eq(videoDocuments.status, 'pending'),
        sql`${videoDocuments.updatedAt} < now() - interval '10 minutes'`,
      ),
    )
}
