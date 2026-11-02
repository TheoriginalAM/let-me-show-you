'use client'

import { LogoMark } from '@/components/brand/logo'
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
      <div className="rise glass rounded-3xl border-2 border-ink p-8 shadow-[8px_8px_0_0_var(--color-ink)]">
        <LogoMark className="h-11 w-11" />
        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight">Reset password</h1>

        {sent ? (
          <p className="mt-4 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success ring-1 ring-inset ring-success/25">
            If an account exists for {email}, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-muted">
              Enter your email and we&rsquo;ll send you a link to set a new password.
            </p>
            {error && (
              <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-inset ring-danger/25">
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
                className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
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
