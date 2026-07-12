'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { formatRelativeDate } from '@lmsy/shared'
import { deleteComment, postComment } from './actions'

interface ThreadComment {
  id: string
  authorName: string
  authorEmail: string | null
  body: string
  parentId: string | null
  createdAt: string
}

const MAX_NAME = 60
const MAX_BODY = 2000
const NAME_KEY = 'lmsy-comment-name'
const EMAIL_KEY = 'lmsy-comment-email'

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export function Comments({
  slug,
  initialComments,
  isOwner,
  accent,
  defaultName = '',
  defaultEmail = '',
}: {
  slug: string
  initialComments: ThreadComment[]
  isOwner: boolean
  accent: string
  defaultName?: string
  defaultEmail?: string
}) {
  const [comments, setComments] = useState<ThreadComment[]>(initialComments)
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const honeypot = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      if (!defaultName) {
        const n = localStorage.getItem(NAME_KEY)
        if (n) setName(n)
      }
      if (!defaultEmail) {
        const e = localStorage.getItem(EMAIL_KEY)
        if (e) setEmail(e)
      }
    } catch {
      /* ignore */
    }
  }, [defaultName, defaultEmail])

  function remember(): void {
    try {
      localStorage.setItem(NAME_KEY, name.trim())
      localStorage.setItem(EMAIL_KEY, email.trim())
    } catch {
      /* ignore */
    }
  }

  function post(parentId: string | null, text: string, onDone: () => void): void {
    const n = name.trim()
    const e = email.trim()
    const b = text.trim()
    if (!n) return setError('Please add your name.')
    if (!e) return setError('Please add your email.')
    if (!b) return setError('Please write a comment.')
    setError(null)
    startTransition(async () => {
      const res = await postComment(slug, {
        name: n,
        email: e,
        body: b,
        parentId: parentId ?? undefined,
        website: honeypot.current?.value ?? '',
      })
      if (res.ok) {
        setComments((prev) => [...prev, res.comment])
        remember()
        onDone()
      } else {
        setError(res.error)
      }
    })
  }

  function remove(id: string): void {
    startTransition(async () => {
      const res = await deleteComment(slug, id)
      if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id && c.parentId !== id))
    })
  }

  const topLevel = comments.filter((c) => !c.parentId)
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const inputCls =
    'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none'

  function CommentRow({ c, isReply }: { c: ThreadComment; isReply: boolean }) {
    return (
      <div className="flex gap-3">
        <span
          className={`mt-0.5 grid ${isReply ? 'h-7 w-7 text-[0.65rem]' : 'h-8 w-8 text-xs'} shrink-0 place-items-center rounded-full font-bold text-white`}
          style={{ background: accent }}
          aria-hidden
        >
          {initial(c.authorName)}
        </span>
        <div className="min-w-0 flex-1 rounded-2xl border border-line bg-white/[0.02] px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold text-ink">{c.authorName}</span>
            {isOwner && c.authorEmail && (
              <span className="truncate text-xs text-faint">{c.authorEmail}</span>
            )}
            <span className="shrink-0 text-xs text-faint">{formatRelativeDate(c.createdAt)}</span>
            <span className="ml-auto flex items-center gap-2">
              {!isReply && (
                <button
                  onClick={() => {
                    setReplyingTo((v) => (v === c.id ? null : c.id))
                    setReplyBody('')
                  }}
                  className="text-xs text-faint transition hover:text-ink"
                >
                  Reply
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => remove(c.id)}
                  disabled={pending}
                  className="text-xs text-faint transition hover:text-red-300 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{c.body}</p>
        </div>
      </div>
    )
  }

  return (
    <section className="rise flex flex-col gap-5" style={{ animationDelay: '220ms' }}>
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
        {comments.length > 0 ? `Comments (${comments.length})` : 'Comments'}
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending) post(null, body, () => setBody(''))
        }}
        className="glass flex flex-col gap-3 rounded-2xl p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            placeholder="Your name"
            aria-label="Your name"
            className={inputCls}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            maxLength={200}
            placeholder="you@email.com"
            aria-label="Your email"
            className={inputCls}
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={3}
          placeholder="Add a comment…"
          aria-label="Your comment"
          className={`${inputCls} resize-y`}
        />
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
          <span className="text-xs text-faint">
            Your name is shown publicly. Your email is private and used for reply notifications.
          </span>
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

      {topLevel.length === 0 ? (
        <p className="text-sm text-faint">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {topLevel.map((c) => (
            <li key={c.id} className="flex flex-col gap-3">
              <CommentRow c={c} isReply={false} />
              {repliesOf(c.id).length > 0 && (
                <div className="ml-6 flex flex-col gap-3 border-l border-line pl-4">
                  {repliesOf(c.id).map((r) => (
                    <CommentRow key={r.id} c={r} isReply />
                  ))}
                </div>
              )}
              {replyingTo === c.id && (
                <div className="ml-6 flex flex-col gap-2 pl-4">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    maxLength={MAX_BODY}
                    rows={2}
                    autoFocus
                    placeholder={`Reply to ${c.authorName}…`}
                    className={`${inputCls} resize-y`}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => post(c.id, replyBody, () => setReplyingTo(null))}
                      disabled={pending}
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ background: accent }}
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="btn-ghost px-3 py-1.5 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
