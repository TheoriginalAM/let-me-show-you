'use client'

import { LogoMark } from '@/components/brand/logo'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

/** Only allow same-origin relative redirects (no open redirect). */
function safeRedirect(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null
}

function SignupForm() {
  const router = useRouter()
  // Where to go after signup: an explicit ?redirect (e.g. from the gated download
  // page) wins; otherwise land on the invite-gating pending screen.
  const redirectParam = safeRedirect(useSearchParams().get('redirect'))
  const redirectTo = redirectParam ?? '/pending'
  const loginHref = redirectParam
    ? `/login?redirect=${encodeURIComponent(redirectParam)}`
    : '/login'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const { error } = await authClient.signUp.email({ name, email, password })
    setPending(false)
    if (error) {
      setError(error.message ?? "Couldn't create your account. Check your details and try again.")
      return
    }
    // New accounts are invite-gated; land on the requested page (or the pending
    // screen). They're signed in either way, so a gated page like /download opens.
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
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-muted">Start sharing recordings in minutes.</p>
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
          <form onSubmit={onSignUp} className="mt-6 flex flex-col gap-3">
            <input
              type="text"
              required
              placeholder="Your name"
              aria-label="Your name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-ink focus:outline-none"
            />
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
              minLength={8}
              placeholder="Password (min 8 characters)"
              aria-label="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className="btn-primary mt-1 px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {pending ? 'Working…' : 'Sign up'}
            </button>
            <button
              type="button"
              onClick={onMagicLink}
              disabled={pending}
              className="btn-ghost px-4 py-2.5 text-sm disabled:opacity-50"
            >
              Sign up with a magic link
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-muted">
          Already have an account?{' '}
          <Link href={loginHref} className="text-accent transition-colors hover:text-accent-ink">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
