'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const router = useRouter()
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
      setError(error.message ?? 'Sign in failed')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function onMagicLink() {
    setError(null)
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    setPending(true)
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: '/dashboard' })
    setPending(false)
    if (error) {
      setError(error.message ?? 'Could not send magic link')
      return
    }
    setMagicSent(true)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="mt-1 text-sm text-neutral-500">Welcome back to Let Me Show You.</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {magicSent ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Magic link sent — check your email (or the server console in dev).
        </p>
      ) : (
        <form onSubmit={onPasswordLogin} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {pending ? 'Working…' : 'Log in'}
          </button>
          <button
            type="button"
            onClick={onMagicLink}
            disabled={pending}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Email me a magic link
          </button>
        </form>
      )}

      <p className="text-sm text-neutral-500">
        No account?{' '}
        <Link href="/signup" className="text-indigo-600 hover:underline dark:text-indigo-400">
          Sign up
        </Link>
      </p>
    </main>
  )
}
