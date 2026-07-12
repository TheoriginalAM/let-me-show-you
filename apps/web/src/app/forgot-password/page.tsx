'use client'

import { useState } from 'react'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!email || pending) return
    setPending(true)
    setError(null)
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    })
    setPending(false)
    if (error) {
      setError(error.message ?? 'Could not send the reset email.')
      return
    }
    setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="rise glass rounded-2xl p-8 shadow-[0_40px_120px_-40px_rgba(80,70,220,0.7)]">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-b from-[#8281ff] to-accent-strong text-sm text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]">
          ▶
        </span>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">Reset password</h1>

        {sent ? (
          <p className="mt-4 rounded-lg bg-green-500/10 px-3 py-2.5 text-sm text-green-300 ring-1 ring-inset ring-green-500/25">
            If an account exists for {email}, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-muted">
              Enter your email and we&rsquo;ll send you a link to set a new password.
            </p>
            {error && (
              <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/25">
                {error}
              </p>
            )}
            <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
              <input
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending}
                className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {pending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-sm text-muted">
          <Link href="/login" className="text-accent transition-colors hover:text-accent-ink">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
