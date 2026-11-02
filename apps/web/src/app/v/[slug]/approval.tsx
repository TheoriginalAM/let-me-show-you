'use client'

import { useEffect, useState, useTransition } from 'react'
import { postApproval } from './actions'

const NAME_KEY = 'lmsy-comment-name'
const EMAIL_KEY = 'lmsy-comment-email'

export function ApprovalWidget({
  slug,
  defaultName = '',
  defaultEmail = '',
}: {
  slug: string
  defaultName?: string
  defaultEmail?: string
}) {
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [note, setNote] = useState('')
  const [done, setDone] = useState<null | 'approved' | 'changes'>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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

  function submit(status: 'approved' | 'changes'): void {
    const n = name.trim()
    const e = email.trim()
    if (!n) return setError('Please add your name.')
    if (!e) return setError('Please add your email.')
    setError(null)
    startTransition(async () => {
      const res = await postApproval(slug, {
        name: n,
        email: e,
        status,
        note: note.trim() || undefined,
      })
      if (res.ok) {
        try {
          localStorage.setItem(NAME_KEY, n)
          localStorage.setItem(EMAIL_KEY, e)
        } catch {
          /* ignore */
        }
        setDone(status)
      } else {
        setError(res.error ?? 'Could not submit your review.')
      }
    })
  }

  const inputCls =
    'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none'

  if (done) {
    return (
      <div className="rise glass flex items-center gap-3 rounded-2xl p-4">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-bold ${
            done === 'approved' ? 'bg-success text-on-success' : 'bg-hl-orange text-[#17132b]'
          }`}
          aria-hidden
        >
          {done === 'approved' ? '✓' : '!'}
        </span>
        <p role="status" className="text-sm text-ink">
          {done === 'approved'
            ? 'Thanks, your approval was recorded and the owner has been notified.'
            : 'Thanks, your change request was sent to the owner.'}
        </p>
      </div>
    )
  }

  return (
    <section className="rise glass flex flex-col gap-3 rounded-2xl p-4">
      <div>
        <h3 className="font-display text-base font-extrabold tracking-tight text-ink">
          Your review
        </h3>
        <p className="mt-1 text-sm text-muted">
          Approve this recording or request changes. The owner is notified either way.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Your name"
          aria-label="Your name"
          autoComplete="name"
          className={inputCls}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          maxLength={200}
          placeholder="you@email.com"
          aria-label="Your email"
          autoComplete="email"
          className={inputCls}
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Optional note (e.g. what to change)"
        aria-label="Note for the owner (optional)"
        className={`${inputCls} resize-y`}
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => submit('approved')}
          disabled={pending}
          className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-on-success transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Sending…' : '✓ Approve'}
        </button>
        <button
          onClick={() => submit('changes')}
          disabled={pending}
          className="rounded-lg border border-hl-orange/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-warning transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          Request changes
        </button>
      </div>
    </section>
  )
}
