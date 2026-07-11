'use client'

import { useState } from 'react'
import type { DeviceApproveRequest } from '@lmsy/shared'

export function ApproveDevice({ initialCode, account }: { initialCode: string; account: string }) {
  const [code, setCode] = useState(initialCode)
  const [state, setState] = useState<'idle' | 'working' | 'approved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function approve(event: React.FormEvent) {
    event.preventDefault()
    setState('working')
    setError(null)
    const payload: DeviceApproveRequest = { userCode: code }
    const res = await fetch('/api/auth/device/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setState('approved')
      return
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    setError(data.error ?? 'Could not approve this device')
    setState('error')
  }

  if (state === 'approved') {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700 dark:bg-green-950 dark:text-green-300">
          ✓
        </div>
        <h1 className="text-2xl font-bold">Device connected</h1>
        <p className="text-sm text-neutral-500">
          You can return to the desktop app — you’re signed in.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Connect your desktop app</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Signed in as <span className="font-medium">{account}</span>. Confirm the code shown in the
          app.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={approve} className="flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="WXYZ-2345"
          autoCapitalize="characters"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-center font-mono text-lg tracking-widest dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={state === 'working' || !code.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {state === 'working' ? 'Approving…' : 'Approve device'}
        </button>
      </form>
    </main>
  )
}
