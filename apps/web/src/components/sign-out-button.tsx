'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setPending(true)
    await authClient.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={pending}
      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
