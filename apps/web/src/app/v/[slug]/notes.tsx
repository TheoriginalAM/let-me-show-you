'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { VideoDocument } from '@/db/video-notes'
import {
  DOCUMENT_KINDS,
  formatTimestamp,
  paragraphs,
  type Chapter,
  type DocumentKind,
  type TranscriptCue,
} from '@/lib/video-notes'
import { exportMarkdown, Markdown } from './markdown'
import {
  createDocumentAction,
  deleteDocumentAction,
  documentStatusAction,
  requestTranscriptAction,
  retryDocumentAction,
  updateDocumentAction,
  writeSummaryAction,
} from './notes-actions'
import { usePlayer } from './player-context'

export interface VideoNotesProps {
  slug: string
  playbackId: string | null
  isOwner: boolean
  aiReady: boolean
  transcriptStatus: string | null
  transcript: TranscriptCue[] | null
  summary: string | null
  chapters: Chapter[] | null
  notesStatus: string | null
  documents: VideoDocument[]
}

/** The player's position, sampled twice a second (for highlighting where you are). */
function useNow(): number {
  const player = usePlayer()
  const [now, setNow] = useState(0)
  useEffect(() => {
    const t = setInterval(() => {
      const el = player.element()
      if (el && !el.paused) setNow(Math.floor(player.currentTime()))
    }, 500)
    return () => clearInterval(t)
  }, [player])
  return now
}

/** Refreshes the page every few seconds while something is still being made (owners only). */
function useRefreshWhile(active: boolean): void {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const started = Date.now()
    const t = setInterval(() => {
      if (Date.now() - started > 10 * 60 * 1000) clearInterval(t)
      else router.refresh()
    }, 5000)
    return () => clearInterval(t)
  }, [active, router])
}

const card = 'card rounded-2xl p-5'
const heading = 'font-display text-lg font-extrabold tracking-tight text-ink'

/** Transcript, summary, chapters and write-ups for a recording. */
export function VideoNotes(props: VideoNotesProps) {
  const { isOwner, transcriptStatus, notesStatus } = props
  const transcript = props.transcript ?? []
  const chapters = props.chapters ?? []
  const ready = transcriptStatus === 'ready' && transcript.length > 0
  const docs = props.documents

  useRefreshWhile(
    isOwner && (transcriptStatus === 'pending' || (ready && notesStatus === 'pending')),
  )

  if (!isOwner && !ready && docs.length === 0) return null

  return (
    <section
      aria-label="Notes"
      className="rise flex flex-col gap-4"
      style={{ animationDelay: '180ms' }}
    >
      {props.summary && (
        <div className={card}>
          <div className="flex items-start justify-between gap-3">
            <h2 className={heading}>Summary</h2>
            {isOwner && props.aiReady && <RewriteSummary slug={props.slug} />}
          </div>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-muted">{props.summary}</p>
        </div>
      )}

      {chapters.length > 1 && <Chapters chapters={chapters} />}

      {ready && <Transcript cues={transcript} />}

      {isOwner && (
        <OwnerTools
          {...props}
          ready={ready}
          hasSummary={Boolean(props.summary)}
          summaryPending={ready && notesStatus === 'pending'}
        />
      )}

      {docs.map((d) => (
        <DocumentCard
          key={d.id}
          doc={d}
          slug={props.slug}
          playbackId={props.playbackId}
          isOwner={isOwner}
        />
      ))}
    </section>
  )
}

function RewriteSummary({ slug }: { slug: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await writeSummaryAction(slug).catch(() => null)
            setError(res?.ok ? null : (res?.error ?? 'Couldn’t start that. Try again.'))
          })
        }
        className="shrink-0 rounded-lg px-2 py-1 text-sm text-faint transition hover:text-ink disabled:opacity-50"
      >
        {pending ? 'Starting…' : 'Rewrite'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function Chapters({ chapters }: { chapters: Chapter[] }) {
  const player = usePlayer()
  const now = useNow()
  const current = chapters.reduce((at, c, i) => (c.start <= now ? i : at), 0)
  return (
    <nav aria-label="Chapters" className={card}>
      <h2 className={heading}>Chapters</h2>
      <ol className="mt-3 grid gap-1 sm:grid-cols-2">
        {chapters.map((c, i) => (
          <li key={c.start}>
            <button
              type="button"
              onClick={() => player.seek(c.start)}
              aria-current={i === current && now > 0 ? 'true' : undefined}
              className={`flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-surface-2 ${
                i === current && now > 0 ? 'bg-accent/12' : ''
              }`}
            >
              <span className="w-12 shrink-0 font-mono text-sm font-semibold text-accent-ink">
                {formatTimestamp(c.start)}
              </span>
              <span className="text-ink">{c.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Transcript({ cues }: { cues: TranscriptCue[] }) {
  const player = usePlayer()
  const now = useNow()
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  const paras = useMemo(() => paragraphs(cues), [cues])
  const q = query.trim().toLowerCase()
  const shown = q ? paras.filter((p) => p.text.toLowerCase().includes(q)) : paras

  async function copy() {
    const text = paras.map((p) => `[${formatTimestamp(p.start)}] ${p.text}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
    setTimeout(() => setCopied(null), 2500)
  }

  return (
    <details className={`${card} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg [&::-webkit-details-marker]:hidden">
        <h2 className={heading}>Transcript</h2>
        <span className="text-sm text-faint group-open:hidden">Show</span>
        <span className="hidden text-sm text-faint group-open:inline">Hide</span>
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search what was said"
          aria-label="Search the transcript"
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
        />
        <button type="button" onClick={() => void copy()} className="btn-ghost px-3 py-2 text-sm">
          {copied === 'yes' ? 'Copied' : copied === 'no' ? 'Couldn’t copy' : 'Copy transcript'}
        </button>
      </div>
      <p role="status" className="sr-only">
        {q ? `${shown.length} matching ${shown.length === 1 ? 'part' : 'parts'}` : ''}
      </p>
      <ol className="mt-3 flex max-h-[28rem] flex-col gap-1 overflow-y-auto pr-1">
        {shown.map((p) => {
          const active = now >= p.start && now < p.end + 1
          return (
            <li
              key={p.start}
              className={`flex gap-3 rounded-xl px-2 py-1.5 ${active ? 'bg-accent/12' : ''}`}
            >
              <button
                type="button"
                onClick={() => player.seek(p.start)}
                aria-label={`Play from ${formatTimestamp(p.start)}`}
                className="h-fit min-h-6 w-12 shrink-0 rounded-md py-0.5 text-left font-mono text-sm font-semibold text-accent-ink hover:underline"
              >
                {formatTimestamp(p.start)}
              </button>
              <p className="leading-relaxed text-muted">
                <Highlight text={p.text} query={q} />
              </p>
            </li>
          )
        })}
        {q && shown.length === 0 && (
          <li className="px-2 py-3 text-sm text-faint">Nothing matches “{query}”.</li>
        )}
      </ol>
    </details>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  let i = 0
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, i)) {
    parts.push(text.slice(i, at))
    parts.push(
      <mark key={at} className="rounded bg-hl-yellow px-0.5 text-[#17132b]">
        {text.slice(at, at + query.length)}
      </mark>,
    )
    i = at + query.length
  }
  parts.push(text.slice(i))
  return <>{parts}</>
}

function OwnerTools(
  props: VideoNotesProps & { ready: boolean; hasSummary: boolean; summaryPending: boolean },
) {
  const { slug, transcriptStatus, ready, aiReady } = props
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<DocumentKind | null>(null)
  const [instructions, setInstructions] = useState('')
  const chosen = DOCUMENT_KINDS.find((k) => k.id === kind)

  function run(action: () => Promise<{ ok: boolean; error?: string } | null>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await action().catch(() => null)
      if (res?.ok) after?.()
      else setError(res?.error ?? 'That didn’t work. Check your connection and try again.')
    })
  }

  if (!ready) {
    return (
      <div className={`${card} border-dashed`}>
        <h2 className={heading}>Captions and transcript</h2>
        {transcriptStatus === 'pending' ? (
          <p role="status" className="mt-2 text-muted">
            Transcribing this recording. It usually takes a minute or two, and captions appear in
            the player when it’s done.
          </p>
        ) : transcriptStatus === 'none' ? (
          <p className="mt-2 text-muted">
            There’s no speech in this recording, so there’s nothing to transcribe.
          </p>
        ) : (
          <p className="mt-2 text-muted">
            {transcriptStatus === 'failed'
              ? 'The transcript didn’t work last time.'
              : 'Add captions for viewers and a searchable transcript.'}
            {aiReady ? ' Then a summary, chapters and write-ups can be made from it.' : ''}
          </p>
        )}
        {transcriptStatus !== 'none' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => requestTranscriptAction(slug))}
            className={`mt-4 px-4 py-2 text-sm disabled:opacity-50 ${transcriptStatus === 'pending' ? 'btn-ghost' : 'btn-primary'}`}
          >
            {pending
              ? 'Working…'
              : transcriptStatus === 'pending'
                ? 'Check again'
                : transcriptStatus === 'failed'
                  ? 'Try again'
                  : 'Create transcript'}
          </button>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    )
  }

  if (!aiReady) return null

  return (
    <div className={`${card} border-dashed`}>
      <h2 className={heading}>Make something from this recording</h2>
      <p className="mt-1 text-sm text-muted">
        Written from what you said and showed. You can edit it, and viewers only see it once you
        choose to show it here.
      </p>

      {!props.hasSummary && (
        <p className="mt-3 text-sm text-muted" role={props.summaryPending ? 'status' : undefined}>
          {props.summaryPending ? (
            'Writing a summary and chapters…'
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => writeSummaryAction(slug))}
              className="font-medium text-accent-ink underline underline-offset-2 disabled:opacity-50"
            >
              {props.notesStatus === 'failed'
                ? 'The summary didn’t work. Try again'
                : 'Write a summary and chapters'}
            </button>
          )}
        </p>
      )}

      <div role="group" aria-label="What to make" className="mt-4 grid gap-2 sm:grid-cols-3">
        {DOCUMENT_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => setKind(kind === k.id ? null : k.id)}
            className={`flex flex-col gap-0.5 rounded-xl border-2 px-3 py-2.5 text-left transition ${
              kind === k.id
                ? 'border-ink bg-surface shadow-[3px_3px_0_0_var(--color-ink)]'
                : 'border-line hover:border-line-strong'
            }`}
          >
            <span className="font-semibold text-ink">{k.label}</span>
            <span className="text-xs leading-snug text-muted">{k.blurb}</span>
          </button>
        ))}
      </div>

      {chosen && (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(
              () => createDocumentAction(slug, chosen.id, instructions),
              () => {
                setKind(null)
                setInstructions('')
              },
            )
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            {chosen.id === 'custom' ? 'What should it be?' : 'Anything to add? (optional)'}
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={1000}
              rows={2}
              required={chosen.id === 'custom'}
              placeholder={
                chosen.id === 'custom'
                  ? 'For example: a short FAQ for new staff'
                  : 'For example: keep it under 150 words'
              }
              className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="btn-primary self-start px-5 py-2.5 text-sm"
          >
            {pending
              ? 'Starting…'
              : chosen.id === 'custom'
                ? 'Write it'
                : `Write the ${chosen.noun}`}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function DocumentCard({
  doc,
  slug,
  playbackId,
  isOwner,
}: {
  doc: VideoDocument
  slug: string
  playbackId: string | null
  isOwner: boolean
}) {
  const router = useRouter()
  const article = useRef<HTMLElement>(null)
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const [markdown, setMarkdown] = useState(doc.markdown)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const kind = DOCUMENT_KINDS.find((k) => k.id === doc.kind)

  // While it's being written, check every few seconds and refresh when it's done.
  useEffect(() => {
    if (doc.status !== 'pending' || !isOwner) return
    const t = setInterval(async () => {
      const status = await documentStatusAction(slug, doc.id).catch(() => null)
      if (status && status !== 'pending') router.refresh()
    }, 3000)
    return () => clearInterval(t)
  }, [doc.status, doc.id, isOwner, slug, router])

  function act(
    action: () => Promise<{ ok: boolean; error?: string }>,
    done?: string,
    after?: () => void,
  ) {
    setNote(null)
    start(async () => {
      const res = await action().catch(() => null)
      if (res?.ok) {
        after?.()
        if (done) setNote({ text: done, error: false })
      } else {
        setNote({ text: res?.error ?? 'That didn’t work. Try again.', error: true })
      }
    })
  }

  async function copy() {
    const shareUrl = `${window.location.origin}${window.location.pathname}`
    const text = `# ${doc.title}\n\n${exportMarkdown(doc.markdown, { shareUrl, playbackId })}`
    try {
      await navigator.clipboard.writeText(text)
      setNote({ text: 'Copied as Markdown, with links to each moment.', error: false })
    } catch {
      setNote({ text: 'Couldn’t copy. Your browser blocked it.', error: true })
    }
  }

  function savePdf() {
    const root = document.documentElement
    article.current?.setAttribute('data-print-target', '')
    root.setAttribute('data-printing', '')
    const done = () => {
      root.removeAttribute('data-printing')
      article.current?.removeAttribute('data-print-target')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
  }

  return (
    <article ref={article} aria-labelledby={`doc-${doc.id}`} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-faint">
            {kind?.label}
            {isOwner &&
              doc.status === 'ready' &&
              (doc.published ? ', shown on this page' : ', only your business sees this')}
          </p>
          <h2 id={`doc-${doc.id}`} className={`${heading} mt-0.5`}>
            {doc.title}
          </h2>
        </div>
        {doc.status === 'ready' && !editing && (
          <div className="flex flex-wrap gap-2" data-print-hide>
            {isOwner && (
              <button
                type="button"
                aria-pressed={doc.published}
                disabled={pending}
                onClick={() =>
                  act(
                    () => updateDocumentAction(slug, doc.id, { published: !doc.published }),
                    doc.published ? 'Hidden from viewers.' : 'Now shown on this page.',
                  )
                }
                className={`px-3 py-1.5 text-sm ${doc.published ? 'btn-ghost' : 'btn-primary'}`}
              >
                {doc.published ? 'Hide from viewers' : 'Show on this page'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void copy()}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Copy
            </button>
            <button type="button" onClick={savePdf} className="btn-ghost px-3 py-1.5 text-sm">
              Save as PDF
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-ghost px-3 py-1.5 text-sm"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        {doc.status === 'pending' ? (
          <p role="status" className="flex items-center gap-3 text-muted">
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-accent motion-reduce:animate-[spin_3s_linear_infinite]"
            />
            Writing your {kind?.noun ?? 'write-up'}. This usually takes under a minute.
          </p>
        ) : doc.status === 'failed' ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-danger">
              {doc.error ?? 'This didn’t work.'}
            </p>
            {isOwner && (
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => retryDocumentAction(slug, doc.id))}
                className="btn-primary px-4 py-2 text-sm"
              >
                Try again
              </button>
            )}
          </div>
        ) : editing ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              act(
                () => updateDocumentAction(slug, doc.id, { title, markdown }),
                'Saved.',
                () => setEditing(false),
              )
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm text-muted">
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-muted">
              Text
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                rows={16}
                className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-sm leading-relaxed text-ink focus:border-ink focus:outline-none"
              />
              <span className="text-xs text-faint">
                Write [1:05] to link to a moment, and put ![caption](t=65) on its own line for a
                screenshot at 65 seconds.
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm">
                {pending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setTitle(doc.title)
                  setMarkdown(doc.markdown)
                }}
                className="btn-ghost px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <Markdown markdown={doc.markdown} playbackId={playbackId} />
        )}
      </div>

      {isOwner && doc.status !== 'pending' && !editing && (
        <div className="mt-4 flex justify-end" data-print-hide>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              confirmDelete ? act(() => deleteDocumentAction(slug, doc.id)) : setConfirmDelete(true)
            }
            onBlur={() => setConfirmDelete(false)}
            className={`rounded-lg px-2.5 py-1 text-sm transition disabled:opacity-50 ${
              confirmDelete
                ? 'bg-danger font-semibold text-on-danger'
                : 'text-faint hover:text-danger'
            }`}
          >
            {confirmDelete ? 'Delete for good?' : 'Delete'}
          </button>
        </div>
      )}

      {note && (
        <p
          role={note.error ? 'alert' : 'status'}
          className={`mt-3 text-sm ${note.error ? 'text-danger' : 'text-success'}`}
        >
          {note.text}
        </p>
      )}
    </article>
  )
}
