'use client'

import { useEffect, useState, useTransition } from 'react'
import { inviteToRoom } from '@/app/m/[slug]/actions'
import { createRoomAction, deleteRoomAction, renameRoomAction, setLobbyAction } from './actions'

interface RoomItem {
  id: string
  name: string
  slug: string
  lobbyEnabled: boolean
}

const inputCls =
  'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none'

export function RoomsManager({ rooms, domain }: { rooms: RoomItem[]; domain: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function create(): void {
    if (pending) return // Enter can fire while a create is already running
    setError(null)
    startTransition(async () => {
      const res = await createRoomAction(name.trim() || 'Meeting room')
      if (res.ok) setName('')
      else setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} domain={domain} />
      ))}

      <div className="glass rounded-2xl p-5">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">New room</h2>
        <p className="mt-1 text-sm text-muted">
          Handy for a standing client call or a team room. Each room keeps its own link.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Weekly client check-in"
            className={inputCls}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="btn-primary shrink-0 px-5 py-2.5 text-sm" disabled={pending} onClick={create}>
            {pending ? 'Creating…' : 'Create room'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      </div>
    </div>
  )
}

function RoomCard({ room, domain }: { room: RoomItem; domain: string }) {
  const link = `https://${domain}/m/${room.slug}`
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(room.name)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNote('Could not copy. Select the link and copy it manually.')
    }
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>): void {
    setNote(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setNote(res.error ?? 'Something went wrong.')
    })
  }

  function sendInvites(): void {
    setNote(null)
    startTransition(async () => {
      const res = await inviteToRoom(room.slug, emails)
      if (!res.ok) {
        setNote(res.error)
        return
      }
      setEmails('')
      setInviteOpen(false)
      setNote(
        res.failed.length
          ? `Sent ${res.sent}. Couldn't email ${res.failed.join(', ')}.`
          : `Invite sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}.`,
      )
    })
  }

  return (
    <div className="glass rise rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className={inputCls}
                autoFocus
              />
              <button
                className="btn-ghost shrink-0 px-3 py-2 text-sm"
                disabled={pending}
                onClick={() => {
                  run(() => renameRoomAction(room.id, title))
                  setRenaming(false)
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <h2 className="truncate font-display text-lg font-semibold tracking-tight text-ink">
              {room.name}
            </h2>
          )}
          <p className="mt-1 truncate font-mono text-sm text-muted">{link.replace('https://', '')}</p>
        </div>
        <a
          href={`/m/${room.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary shrink-0 px-5 py-2.5 text-sm"
        >
          Start meeting
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setInviteOpen((o) => !o)}>
          Email invite
        </button>
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setRenaming((r) => !r)}>
          Rename
        </button>
        <label className="ml-1 flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={room.lobbyEnabled}
            disabled={pending}
            onChange={(e) => run(() => setLobbyAction(room.id, e.target.checked))}
            className="h-4 w-4 accent-[#8b8bf6]"
          />
          Guests wait in a lobby
        </label>
        <button
          className={`ml-auto rounded-lg px-3 py-1.5 text-sm transition ${
            confirmDelete ? 'bg-red-500/20 text-red-200' : 'text-faint hover:text-red-300'
          }`}
          disabled={pending}
          onClick={() =>
            confirmDelete ? run(() => deleteRoomAction(room.id)) : setConfirmDelete(true)
          }
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>

      {inviteOpen && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="client@company.com, colleague@company.com"
            className={inputCls}
          />
          <button
            className="btn-primary shrink-0 px-5 py-2.5 text-sm"
            disabled={pending || !emails.trim()}
            onClick={sendInvites}
          >
            {pending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
      {note && <p className="mt-3 text-sm text-muted">{note}</p>}
    </div>
  )
}
