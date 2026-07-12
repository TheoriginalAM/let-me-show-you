'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createWorkspaceAction, switchWorkspaceAction } from './workspace-actions'

interface WS {
  id: string
  name: string
  role: 'owner' | 'member'
}

function initial(name: string | undefined): string {
  return (name ?? '?').trim().charAt(0).toUpperCase() || '?'
}

/** Active-workspace title + a dropdown to switch, create, and open settings. */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: WS[]
  activeId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null

  function switchTo(id: string): void {
    if (id === active?.id) return setOpen(false)
    startTransition(async () => {
      await switchWorkspaceAction(id)
      setOpen(false)
      router.refresh()
    })
  }

  function create(e: React.FormEvent): void {
    e.preventDefault()
    const n = name.trim()
    if (!n || pending) return
    startTransition(async () => {
      await createWorkspaceAction(n)
      setName('')
      setCreating(false)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition hover:bg-white/[0.03]"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-[#8281ff] to-accent-strong text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]"
          aria-hidden
        >
          {initial(active?.name)}
        </span>
        <span className="font-display text-2xl font-semibold tracking-tight">
          {active?.name ?? 'No workspace'}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 text-faint transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div className="glass absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-line p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Workspaces
            </p>
            <div className="flex max-h-64 flex-col overflow-y-auto">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => switchTo(w.id)}
                  disabled={pending}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/[0.04] disabled:opacity-50"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/5 text-[11px] font-bold text-ink">
                    {initial(w.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{w.name}</span>
                  {w.role === 'owner' && <span className="text-[10px] text-faint">Owner</span>}
                  {w.id === active?.id && <span className="text-accent-ink">✓</span>}
                </button>
              ))}
            </div>

            <div className="my-1.5 border-t border-line" />

            {creating ? (
              <form onSubmit={create} className="flex gap-1.5 p-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoFocus
                  placeholder="Workspace name"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={pending || !name.trim()}
                  className="btn-primary px-2.5 py-1.5 text-xs disabled:opacity-50"
                >
                  Create
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-white/[0.04] hover:text-ink"
              >
                <span className="text-base leading-none">+</span> New workspace
              </button>
            )}

            {active?.role === 'owner' && (
              <Link
                href="/dashboard/workspace"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-white/[0.04] hover:text-ink"
                onClick={() => setOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Workspace settings
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
