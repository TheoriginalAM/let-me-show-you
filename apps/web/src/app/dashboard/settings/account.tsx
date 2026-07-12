'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AccountSettings({ name, email }: { name: string; email: string }) {
  const router = useRouter()

  // ---- Profile (name) ----
  const [displayName, setDisplayName] = useState(name)
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState<string | null>(null)

  async function saveName(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const n = displayName.trim()
    if (!n || n === name || savingName) return
    setSavingName(true)
    setNameMsg(null)
    const { error } = await authClient.updateUser({ name: n })
    setSavingName(false)
    if (error) setNameMsg(error.message ?? 'Could not save your name.')
    else {
      setNameMsg('Saved.')
      router.refresh()
    }
  }

  // ---- Password ----
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwPending, setPwPending] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  async function changePw(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setPwErr(null)
    setPwMsg(null)
    if (next.length < 8) return setPwErr('Use at least 8 characters.')
    if (next !== confirm) return setPwErr('Those passwords do not match.')
    setPwPending(true)
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    })
    setPwPending(false)
    if (error) {
      setPwErr(error.message ?? 'Could not change your password. Check your current password.')
      return
    }
    setPwMsg('Password updated.')
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  const inputCls =
    'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none'

  return (
    <div className="flex flex-col gap-10">
      {/* Profile */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Profile</h2>
          <p className="mt-1 text-sm text-muted">Your name and account email.</p>
        </div>
        <form onSubmit={saveName} className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted">Name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted">Email</label>
            <input value={email} disabled className={`${inputCls} cursor-not-allowed opacity-60`} />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingName || !displayName.trim() || displayName.trim() === name}
              className="btn-primary w-fit px-4 py-2 text-sm disabled:opacity-50"
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
            {nameMsg && <span className="text-sm text-muted">{nameMsg}</span>}
          </div>
        </form>
      </section>

      {/* Password */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Password</h2>
          <p className="mt-1 text-sm text-muted">Change the password you use to sign in.</p>
        </div>
        <form onSubmit={changePw} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputCls}
          />
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={inputCls}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls}
          />
          {pwErr && <p className="text-sm text-red-300">{pwErr}</p>}
          {pwMsg && <p className="text-sm text-green-300">{pwMsg}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pwPending || !current || !next}
              className="btn-primary w-fit px-4 py-2 text-sm disabled:opacity-50"
            >
              {pwPending ? 'Updating…' : 'Update password'}
            </button>
            <Link href="/forgot-password" className="text-sm text-faint transition hover:text-muted">
              Forgot your current password?
            </Link>
          </div>
        </form>
      </section>
    </div>
  )
}
