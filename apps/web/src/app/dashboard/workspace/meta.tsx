'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteWorkspaceAction, renameWorkspaceAction } from './actions'

export function RenameWorkspace({ name }: { name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save(e: React.FormEvent): void {
    e.preventDefault()
    const next = value.trim()
    if (!next || next === name || pending) return
    setError(null)
    startTransition(async () => {
      const res = await renameWorkspaceAction(next).catch(() => ({
        ok: false,
        error: "Couldn't rename the business. Check your connection and try again.",
      }))
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        router.refresh()
      } else {
        setError(res.error ?? "Couldn't rename the business. Try again.")
      }
    })
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <input
        aria-label="Business name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={80}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending || !value.trim() || value.trim() === name}
        className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
      >
        {saved ? 'Saved' : 'Rename'}
      </button>
      {/* Always in the DOM so screen readers hear "Saved" when it appears. */}
      <span role="status" className="sr-only">
        {saved ? 'Business name saved' : ''}
      </span>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

export function DeleteWorkspace({ canDelete }: { canDelete: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function del(): void {
    startTransition(async () => {
      const res = await deleteWorkspaceAction().catch(() => ({
        ok: false,
        error: "Couldn't delete the business. Check your connection and try again.",
      }))
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(res.error ?? "Couldn't delete the business. Try again.")
        setConfirming(false)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-danger/20 bg-danger/[0.04] p-4">
      <h3 className="text-sm font-semibold text-ink">Delete this business</h3>
      <p className="text-sm text-muted">
        Permanently deletes this business and all of its recordings. This cannot be undone.
        {!canDelete && ' You need at least one business, so add another before deleting this one.'}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            onClick={del}
            disabled={pending}
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-on-danger transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Deleting…' : 'Yes, delete everything'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={!canDelete}
          className="w-fit rounded-lg border border-danger/25 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition hover:border-danger/40 hover:bg-danger/20 disabled:opacity-40"
        >
          Delete business
        </button>
      )}
    </div>
  )
}
