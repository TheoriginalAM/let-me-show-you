'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { unlockShare } from './actions'

/**
 * Lock screen for a password-protected share. Deliberately reveals nothing
 * about the recording (no title, owner, or thumbnail) until the viewer proves
 * the password. On success the server sets an unlock cookie and we refresh the
 * route, which re-renders into the player.
 */
export function PasswordGate({ slug }: { slug: string }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || pending) return
    setError(null)
    startTransition(async () => {
      const result = await unlockShare(slug, password)
      if (result.ok) {
        router.refresh()
      } else {
        setError('Incorrect password. Try again.')
        setPassword('')
      }
    })
  }

  return (
    <div className="rise relative" style={{ animationDelay: '80ms' }}>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_20%,rgba(120,110,255,0.28),transparent_70%)] blur-2xl" />
      <div className="glass flex flex-col items-center gap-5 rounded-2xl px-6 py-14 text-center shadow-[0_40px_120px_-40px_rgba(80,70,220,0.7)]">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-accent"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>

        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            This recording is protected
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Enter the password shared with you to watch it.
          </p>
        </div>

        <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            className="w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-center text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          {error && <p className="text-xs text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={pending || !password}
            className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {pending ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  )
}
