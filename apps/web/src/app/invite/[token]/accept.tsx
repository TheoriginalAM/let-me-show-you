'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInviteAction } from './actions'

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function accept(): void {
    setError(null)
    startTransition(async () => {
      const res = await acceptInviteAction(token)
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <button
        onClick={accept}
        disabled={pending}
        className="btn-primary w-full px-5 py-2.5 text-sm disabled:opacity-50"
      >
        {pending ? 'Joining…' : 'Accept invite'}
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  )
}
