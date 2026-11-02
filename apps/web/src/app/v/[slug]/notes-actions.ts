'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { SHARE_PATH } from '@lmsy/shared'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { videos } from '@/db/schema'
import {
  createVideoDocument,
  deleteVideoDocument,
  getTranscriptTarget,
  getVideoDocument,
  recentDocumentCount,
  restartVideoDocument,
  updateVideoDocument,
} from '@/db/video-notes'
import { userCanAccessVideo } from '@/db/workspaces'
import { aiConfigured, writeDocument, writeNotes } from '@/lib/ai-notes'
import { getCurrentUser } from '@/lib/current-user'
import { requestTranscript } from '@/lib/transcripts'
import { DOCUMENT_KINDS, isDocumentKind, type DocumentKind } from '@/lib/video-notes'

// Owner-only actions for the share page's notes panel: transcripts, the
// summary, and write-ups. Every one checks the caller belongs to the business.

type Result = { ok: true } | { ok: false; error: string }

const MAX_INSTRUCTIONS = 1000
const MAX_TITLE = 120
const MAX_MARKDOWN = 50_000
/** Write-ups per recording per hour (each one is a paid AI call). */
const MAX_DOCUMENTS_PER_HOUR = 12

/** The video behind a share link, if the signed-in user belongs to its business. */
async function ownedVideo(slug: string): Promise<{ id: string; userId: string } | null> {
  const me = await getCurrentUser()
  if (!me?.approved) return null
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(eq(videos.shareSlug, slug))
    .limit(1)
  const id = rows[0]?.id
  if (!id || !(await userCanAccessVideo(me.id, id))) return null
  return { id, userId: me.id }
}

function refresh(slug: string): void {
  revalidatePath(`/${SHARE_PATH}/${slug}`)
}

function runLater(label: string, job: () => Promise<unknown>): void {
  after(() =>
    job().catch((err) => {
      console.error(`[notes] ${label} failed`, err instanceof Error ? err.message : err)
    }),
  )
}

/** Starts (or re-checks) the transcript, then the summary once it's ready. */
export async function requestTranscriptAction(slug: string): Promise<Result> {
  const v = await ownedVideo(slug)
  if (!v) return { ok: false, error: 'Only people in this business can do that.' }
  const target = await getTranscriptTarget(v.id)
  if (!target || target.status !== 'ready') {
    return { ok: false, error: 'The video is still processing. Try again once it plays.' }
  }
  try {
    await requestTranscript(v.id, { recheck: true })
  } catch {
    refresh(slug)
    return { ok: false, error: "Couldn't start the transcript. Try again in a minute." }
  }
  runLater('summary', () => writeNotes(v.id))
  refresh(slug)
  return { ok: true }
}

/** Writes (or rewrites) the summary and chapters. */
export async function writeSummaryAction(slug: string): Promise<Result> {
  const v = await ownedVideo(slug)
  if (!v) return { ok: false, error: 'Only people in this business can do that.' }
  if (!aiConfigured()) return { ok: false, error: 'AI write-ups aren’t set up on this server.' }
  await db.update(videos).set({ notesStatus: null }).where(eq(videos.id, v.id))
  runLater('summary', () => writeNotes(v.id))
  refresh(slug)
  return { ok: true }
}

export async function createDocumentAction(
  slug: string,
  kind: DocumentKind,
  instructions: string,
): Promise<Result & { id?: string }> {
  const v = await ownedVideo(slug)
  if (!v) return { ok: false, error: 'Only people in this business can do that.' }
  if (!aiConfigured()) return { ok: false, error: 'AI write-ups aren’t set up on this server.' }
  if (!isDocumentKind(kind)) return { ok: false, error: 'Pick what to make.' }
  const note = instructions.trim().slice(0, MAX_INSTRUCTIONS)
  if (kind === 'custom' && !note) return { ok: false, error: 'Say what you’d like written.' }
  const target = await getTranscriptTarget(v.id)
  if (target?.transcriptStatus !== 'ready') {
    return { ok: false, error: 'This needs a transcript first.' }
  }
  if ((await recentDocumentCount(v.id)) >= MAX_DOCUMENTS_PER_HOUR) {
    return { ok: false, error: 'That’s a lot of write-ups for one hour. Try again later.' }
  }
  const label = DOCUMENT_KINDS.find((k) => k.id === kind)!.label
  const id = await createVideoDocument({
    videoId: v.id,
    kind,
    title: label,
    instructions: note || null,
    createdBy: v.userId,
  })
  runLater('write-up', () => writeDocument(id))
  refresh(slug)
  return { ok: true, id }
}

/** Whether a write-up is still being written (polled while one is). */
export async function documentStatusAction(
  slug: string,
  id: string,
): Promise<'pending' | 'ready' | 'failed' | null> {
  const v = await ownedVideo(slug)
  if (!v) return null
  const doc = await getVideoDocument(id)
  return doc && doc.videoId === v.id ? doc.status : null
}

/** A write-up of this video, for an owner. */
async function ownedDocument(slug: string, id: string) {
  const v = await ownedVideo(slug)
  if (!v) return null
  const doc = await getVideoDocument(id)
  return doc && doc.videoId === v.id ? doc : null
}

export async function updateDocumentAction(
  slug: string,
  id: string,
  patch: { title?: string; markdown?: string; published?: boolean },
): Promise<Result> {
  const doc = await ownedDocument(slug, id)
  if (!doc) return { ok: false, error: 'Couldn’t find that write-up. Refresh the page.' }
  if (doc.status !== 'ready') return { ok: false, error: 'Wait for it to finish first.' }
  const title = patch.title?.trim()
  if (patch.title !== undefined && !title) return { ok: false, error: 'Give it a title.' }
  await updateVideoDocument(id, {
    ...(title !== undefined ? { title: title.slice(0, MAX_TITLE) } : {}),
    ...(patch.markdown !== undefined ? { markdown: patch.markdown.slice(0, MAX_MARKDOWN) } : {}),
    ...(patch.published !== undefined ? { published: patch.published } : {}),
  })
  refresh(slug)
  return { ok: true }
}

export async function retryDocumentAction(slug: string, id: string): Promise<Result> {
  const doc = await ownedDocument(slug, id)
  if (!doc) return { ok: false, error: 'Couldn’t find that write-up. Refresh the page.' }
  if (!aiConfigured()) return { ok: false, error: 'AI write-ups aren’t set up on this server.' }
  await restartVideoDocument(id)
  runLater('write-up', () => writeDocument(id))
  refresh(slug)
  return { ok: true }
}

export async function deleteDocumentAction(slug: string, id: string): Promise<Result> {
  const doc = await ownedDocument(slug, id)
  if (!doc) return { ok: false, error: 'Couldn’t find that write-up. Refresh the page.' }
  await deleteVideoDocument(id)
  refresh(slug)
  return { ok: true }
}
