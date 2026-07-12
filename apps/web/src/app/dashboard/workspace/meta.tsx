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
      const res = await renameWorkspaceAction(next)
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        router.refresh()
      } else {
        setError(res.error ?? 'Could not rename.')
      }
    })
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={80}
        className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending || !value.trim() || value.trim() === name}
        className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
      >
        {saved ? 'Saved' : 'Rename'}
      </button>
      {error && <p className="w-full text-sm text-red-300">{error}</p>}
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
      const res = await deleteWorkspaceAction()
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(res.error ?? 'Could not delete.')
        setConfirming(false)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
      <h3 className="text-sm font-semibold text-ink">Delete this workspace</h3>
      <p className="text-sm text-muted">
        Permanently deletes the workspace and all of its recordings. This cannot be undone.
        {!canDelete && ' You must keep at least one workspace.'}
      </p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            onClick={del}
            disabled={pending}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-400 disabled:opacity-50"
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
          className="w-fit rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-300 transition hover:border-red-500/40 hover:bg-red-500/20 disabled:opacity-40"
        >
          Delete workspace
        </button>
      )}
    </div>
  )
}
