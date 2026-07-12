'use client'

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
  const loginHref = redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'
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
      setError(error.message ?? 'Sign up failed')
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
      setError(error.message ?? 'Could not send magic link')
      return
    }
    setMagicSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-16">
      <div className="rise glass rounded-2xl p-8 shadow-[0_40px_120px_-40px_rgba(80,70,220,0.7)]">
        <div className="flex flex-col items-start gap-6">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-b from-[#8281ff] to-accent-strong text-sm text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]">
            ▶
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-muted">Start sharing recordings in minutes.</p>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/25">
            {error}
          </p>
        )}

        {magicSent ? (
          <p className="mt-6 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-300 ring-1 ring-inset ring-green-500/25">
            Magic link sent — check your email (or the server console in dev).
          </p>
        ) : (
          <form onSubmit={onSignUp} className="mt-6 flex flex-col gap-3">
            <input
              type="text"
              required
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-line-strong focus:outline-none"
            />
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-line-strong focus:outline-none"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-line-strong focus:outline-none"
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
            Log in
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
