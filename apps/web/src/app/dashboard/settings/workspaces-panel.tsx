'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createWorkspaceAction, switchWorkspaceAction } from '../workspace-actions'

interface WS {
  id: string
  name: string
  role: 'owner' | 'member'
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export function WorkspacesPanel({
  workspaces,
  activeId,
}: {
  workspaces: WS[]
  activeId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  function switchTo(id: string): void {
    if (id === activeId || pending) return
    startTransition(async () => {
      await switchWorkspaceAction(id)
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
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Workspaces</h2>
          <p className="mt-1 text-sm text-muted">
            Each workspace has its own recordings, branding, and members. Switch the active one or
            create another.
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="btn-ghost shrink-0 px-3.5 py-2 text-sm"
        >
          + New workspace
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder="Workspace name"
            className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}

      <ul className="flex flex-col gap-2.5">
        {workspaces.map((w) => {
          const isActive = w.id === activeId
          return (
            <li
              key={w.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-4 py-3"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#8281ff] to-accent-strong text-sm font-bold text-white">
                {initial(w.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-ink">{w.name}</span>
                  {isActive && (
                    <span className="rounded-md bg-accent-strong/20 px-1.5 py-0.5 text-xs font-medium text-accent-ink ring-1 ring-inset ring-accent/30">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-xs capitalize text-faint">{w.role}</span>
              </div>
              {isActive ? (
                w.role === 'owner' && (
                  <Link href="/dashboard/workspace" className="btn-ghost px-3.5 py-1.5 text-sm">
                    Manage
                  </Link>
                )
              ) : (
                <button
                  onClick={() => switchTo(w.id)}
                  disabled={pending}
                  className="btn-ghost px-3.5 py-1.5 text-sm disabled:opacity-50"
                >
                  Switch to
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
