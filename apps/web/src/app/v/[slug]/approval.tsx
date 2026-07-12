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
      const res = await postApproval(slug, { name: n, email: e, status, note: note.trim() || undefined })
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
    'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none'

  if (done) {
    return (
      <div className="rise glass flex items-center gap-3 rounded-2xl p-4">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: done === 'approved' ? '#10b981' : '#f59e0b' }}
          aria-hidden
        >
          {done === 'approved' ? '✓' : '!'}
        </span>
        <p className="text-sm text-ink">
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
        <h3 className="font-display text-base font-semibold tracking-tight text-ink">Your review</h3>
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
          className={inputCls}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          maxLength={200}
          placeholder="you@email.com"
          className={inputCls}
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Optional note (e.g. what to change)"
        className={`${inputCls} resize-y`}
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => submit('approved')}
          disabled={pending}
          className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-400 disabled:opacity-50"
        >
          {pending ? 'Sending…' : '✓ Approve'}
        </button>
        <button
          onClick={() => submit('changes')}
          disabled={pending}
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          Request changes
        </button>
      </div>
    </section>
  )
}
