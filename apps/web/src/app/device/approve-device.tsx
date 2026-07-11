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
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <div className="glass rise flex flex-col items-center gap-4 rounded-2xl p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-2xl text-green-300 ring-1 ring-inset ring-green-500/25 shadow-[0_0_30px_-6px_rgba(52,211,153,0.5)]">
            ✓
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Device connected</h1>
          <p className="text-sm leading-relaxed text-muted">
            You can return to the desktop app — you’re signed in.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="glass rise flex flex-col gap-5 rounded-2xl p-8">
        <div className="text-center">
          <span className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_rgba(139,139,246,0.9)]" />
            Desktop app
          </span>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Connect your desktop app
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Signed in as <span className="font-medium text-ink">{account}</span>. Confirm the code
            shown in the app.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-inset ring-red-500/25">
            {error}
          </p>
        )}

        <form onSubmit={approve} className="flex flex-col gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WXYZ-2345"
            autoCapitalize="characters"
            className="rounded-lg border border-line bg-white/[0.03] px-3 py-3 text-center font-mono text-lg tracking-[0.3em] text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={state === 'working' || !code.trim()}
            className="btn-primary px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === 'working' ? 'Approving…' : 'Approve device'}
          </button>
        </form>
      </div>
    </main>
  )
}
