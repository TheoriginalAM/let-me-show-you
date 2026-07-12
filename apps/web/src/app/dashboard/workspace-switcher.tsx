'use client'

import { useState, useTransition } from 'react'
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

/**
 * Inline workspace switcher: the active workspace as a heading, plus a row of
 * pills to switch and a button to create. No floating dropdown (which rendered
 * behind the recordings grid due to the page's transform stacking contexts).
 */
export function WorkspaceSwitcher({
  workspaces,
  activeId,
  activeLogo = null,
  activeColor = null,
}: {
  workspaces: WS[]
  activeId: string | null
  activeLogo?: string | null
  activeColor?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null
  const others = workspaces.filter((w) => w.id !== active?.id)

  function switchTo(id: string): void {
    if (pending) return
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {activeLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeLogo}
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.04] object-contain p-1 ring-1 ring-white/10"
          />
        ) : (
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#8281ff] to-accent-strong text-base font-bold text-white shadow-[0_6px_16px_-6px_rgba(109,109,245,0.9)]"
            style={activeColor ? { background: activeColor } : undefined}
            aria-hidden
          >
            {initial(active?.name)}
          </span>
        )}
        <div className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wider text-faint">
            Workspace
          </span>
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight">
            {active?.name ?? 'No workspace'}
          </h1>
        </div>
      </div>

      {(others.length > 0 || !creating) && (
        <div className="flex flex-wrap items-center gap-2">
          {others.length > 0 && (
            <span className="text-xs font-medium uppercase tracking-wider text-faint">Switch</span>
          )}
          {others.map((w) => (
            <button
              key={w.id}
              onClick={() => switchTo(w.id)}
              disabled={pending}
              className="flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1.5 text-sm text-muted transition hover:border-line-strong hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.08] text-[0.65rem] font-bold text-ink">
                {initial(w.name)}
              </span>
              <span className="max-w-[12rem] truncate">{w.name}</span>
            </button>
          ))}
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-full border border-accent/30 bg-accent-strong/15 px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:border-accent/50 hover:bg-accent-strong/25"
            >
              + New workspace
            </button>
          )}
        </div>
      )}

      {creating && (
        <form onSubmit={create} className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder="Workspace name"
            className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setName('')
            }}
            className="btn-ghost px-3 py-2 text-sm"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
