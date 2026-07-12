'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { formatRelativeDate } from '@lmsy/shared'
import { deleteComment, postComment } from './actions'

interface ThreadComment {
  id: string
  authorName: string
  body: string
  createdAt: string
}

const MAX_NAME = 60
const MAX_BODY = 2000
const NAME_KEY = 'lmsy-comment-name'

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Login-free public comment thread under a shared recording. Anyone viewing can
 * post a name + comment; the video owner (when signed in) can delete. New
 * comments append optimistically; the server also revalidates the route.
 */
export function Comments({
  slug,
  initialComments,
  isOwner,
  accent,
}: {
  slug: string
  initialComments: ThreadComment[]
  isOwner: boolean
  accent: string
}) {
  const [comments, setComments] = useState<ThreadComment[]>(initialComments)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const honeypot = useRef<HTMLInputElement>(null)

  // Remember the commenter's name across visits (feels chat-like on return).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY)
      if (saved) setName(saved)
    } catch {
      /* ignore private-mode storage errors */
    }
  }, [])

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    if (pending) return
    const n = name.trim()
    const b = body.trim()
    if (!n) return setError('Please add your name.')
    if (!b) return setError('Please write a comment.')
    setError(null)
    startTransition(async () => {
      const res = await postComment(slug, {
        name: n,
        body: b,
        website: honeypot.current?.value ?? '',
      })
      if (res.ok) {
        setComments((prev) => [...prev, res.comment])
        setBody('')
        try {
          localStorage.setItem(NAME_KEY, n)
        } catch {
          /* ignore */
        }
      } else {
        setError(res.error)
      }
    })
  }

  function remove(id: string): void {
    startTransition(async () => {
      const res = await deleteComment(slug, id)
      if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id))
    })
  }

  return (
    <section className="rise flex flex-col gap-5" style={{ animationDelay: '220ms' }}>
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
        {comments.length > 0 ? `Comments (${comments.length})` : 'Comments'}
      </h2>

      <form onSubmit={submit} className="glass flex flex-col gap-3 rounded-2xl p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          placeholder="Your name"
          aria-label="Your name"
          className="w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={3}
          placeholder="Add a comment…"
          aria-label="Your comment"
          className="w-full resize-y rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
        />
        {/* Honeypot: hidden from users, tempting to bots. */}
        <input
          ref={honeypot}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-faint">Shown publicly with your name.</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: accent }}
          >
            {pending ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </form>

      {comments.length === 0 ? (
        <p className="text-sm text-faint">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ background: accent }}
                aria-hidden
              >
                {initial(c.authorName)}
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border border-line bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{c.authorName}</span>
                  <span className="shrink-0 text-xs text-faint">
                    {formatRelativeDate(c.createdAt)}
                  </span>
                  {isOwner && (
                    <button
                      onClick={() => remove(c.id)}
                      disabled={pending}
                      className="ml-auto shrink-0 text-xs text-faint transition hover:text-red-300 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
