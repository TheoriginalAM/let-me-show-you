'use client'

import { LogoMark } from '@/components/brand/logo'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

function ResetForm() {
  const router = useRouter()
  const token = useSearchParams().get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (pending) return
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Those passwords do not match.')
    if (!token) return setError('This reset link is invalid.')
    setPending(true)
    setError(null)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setPending(false)
    if (error) {
      setError(error.message ?? 'Could not reset your password. The link may have expired.')
      return
    }
    setDone(true)
    setTimeout(() => router.push('/login'), 1400)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="rise glass rounded-3xl border-2 border-ink p-8 shadow-[8px_8px_0_0_var(--color-ink)]">
        <LogoMark className="h-11 w-11" />
        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight">
          Choose a new password
        </h1>

        {!token ? (
          <p className="mt-4 text-sm text-muted">
            This reset link is missing or invalid.{' '}
            <Link href="/forgot-password" className="text-accent hover:text-accent-ink">
              Request a new one
            </Link>
            .
          </p>
        ) : done ? (
          <p className="mt-4 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success ring-1 ring-inset ring-success/25">
            Password updated. Taking you to sign in…
          </p>
        ) : (
          <>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-inset ring-danger/25"
              >
                {error}
              </p>
            )}
            <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
              <input
                type="password"
                required
                autoFocus
                placeholder="New password (min 8 characters)"
                aria-label="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
              />
              <input
                type="password"
                required
                placeholder="Confirm new password"
                aria-label="Confirm new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending}
                className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  )
}
