'use client'

import { LogoMark } from '@/components/brand/logo'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

/** Only allow same-origin relative redirects (no open redirect). */
function safeRedirect(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
}

function LoginForm() {
  const router = useRouter()
  const redirectTo = safeRedirect(useSearchParams().get('redirect'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error } = await authClient.signIn.email({ email, password })
    setPending(false)
    if (error) {
      setError(
        error.message ?? "Couldn't sign you in. Check your email and password and try again.",
      )
      return
    }
    router.push(redirectTo)
    router.refresh()
  }

  async function onMagicLink() {
    setError(null)
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    setPending(true)
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: redirectTo })
    setPending(false)
    if (error) {
      setError(error.message ?? "Couldn't send the sign-in link. Try again in a minute.")
      return
    }
    setMagicSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="rise glass rounded-3xl border-2 border-ink p-8 shadow-[8px_8px_0_0_var(--color-ink)]">
        <div className="flex flex-col items-start gap-6">
          <LogoMark className="h-11 w-11" />
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted">Welcome back to Let Me Show You.</p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-inset ring-danger/25"
          >
            {error}
          </p>
        )}

        {magicSent ? (
          <p
            role="status"
            className="mt-6 rounded-lg bg-success/10 px-3 py-2 text-sm text-success ring-1 ring-inset ring-success/25"
          >
            Check your email. We sent you a link to sign in.
          </p>
        ) : (
          <form onSubmit={onPasswordLogin} className="mt-6 flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              aria-label="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-ink focus:outline-none"
            />
            <input
              type="password"
              required
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="btn-primary mt-1 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={onMagicLink}
              disabled={pending}
              className="btn-ghost px-4 py-2.5 text-sm disabled:opacity-50"
            >
              Email me a magic link
            </button>
            <Link
              href="/forgot-password"
              className="mt-1 text-center text-xs text-faint transition-colors hover:text-muted"
            >
              Forgot your password?
            </Link>
          </form>
        )}

        <p className="mt-6 text-sm text-muted">
          No account?{' '}
          <Link href="/signup" className="text-accent transition-colors hover:text-accent-ink">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
