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
        className="flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-3 py-2 text-left transition hover:border-line-strong hover:bg-white/[0.06]"
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#8281ff] to-accent-strong text-base font-bold text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]"
          aria-hidden
        >
          {initial(active?.name)}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wider text-faint">
            Workspace
          </span>
          <span className="flex items-center gap-2">
            <span className="truncate font-display text-2xl font-semibold tracking-tight">
              {active?.name ?? 'No workspace'}
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </span>
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
          <div
            className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/15 p-2 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.95)]"
            style={{ backgroundColor: '#1c1c28' }}
          >
            <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wider text-faint">
              Your workspaces
            </p>
            <div className="flex max-h-72 flex-col overflow-y-auto">
              {workspaces.map((w) => {
                const isActive = w.id === active?.id
                return (
                  <button
                    key={w.id}
                    onClick={() => switchTo(w.id)}
                    disabled={pending}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:opacity-50 ${
                      isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.08] text-sm font-bold text-ink">
                      {initial(w.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-ink">
                      {w.name}
                    </span>
                    {w.role === 'owner' && (
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[0.7rem] font-medium text-muted">
                        Owner
                      </span>
                    )}
                    {isActive && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4 shrink-0 text-accent-ink"
                        aria-hidden
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="my-2 border-t border-line" />

            {creating ? (
              <form onSubmit={create} className="flex gap-2 p-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoFocus
                  placeholder="Workspace name"
                  className="min-w-0 flex-1 rounded-xl border border-line-strong bg-white/[0.04] px-3 py-2.5 text-[0.95rem] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={pending || !name.trim()}
                  className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  Create
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent-strong/15 px-3 py-3 text-left font-semibold text-accent-ink transition hover:border-accent/50 hover:bg-accent-strong/25"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-strong/30 text-lg leading-none text-white"
                  aria-hidden
                >
                  +
                </span>
                New workspace
              </button>
            )}

            {active?.role === 'owner' && (
              <Link
                href="/dashboard/workspace"
                className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.95rem] font-medium text-muted transition hover:bg-white/[0.05] hover:text-ink"
                onClick={() => setOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 shrink-0"
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
