'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inviteMemberAction, removeMemberAction, revokeInviteAction } from './actions'

interface Member {
  userId: string
  name: string
  email: string
  role: 'owner' | 'member'
}
interface Invite {
  id: string
  email: string
  role: 'owner' | 'member'
}

export function Members({
  members,
  invites,
  currentUserId,
}: {
  members: Member[]
  invites: Invite[]
  currentUserId: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'owner' | 'member'>('member')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const ownerCount = members.filter((m) => m.role === 'owner').length

  function invite(e: React.FormEvent): void {
    e.preventDefault()
    const value = email.trim()
    if (!value || pending) return
    setError(null)
    setNotice(null)
    setInviteLink(null)
    setCopied(false)
    startTransition(async () => {
      const res = await inviteMemberAction(value, role)
      if (res.ok) {
        setEmail('')
        setInviteLink(res.url)
        setNotice(
          res.emailed
            ? `Invite emailed to ${value}. You can also share this link:`
            : `Invite created for ${value}. The email could not be sent, so share this link:`,
        )
        router.refresh()
      } else {
        setError(res.error ?? 'Could not send invite.')
      }
    })
  }

  async function copyLink(): Promise<void> {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  function remove(userId: string): void {
    startTransition(async () => {
      const res = await removeMemberAction(userId)
      if (res.ok) router.refresh()
      else setError(res.error ?? 'Could not remove member.')
    })
  }

  function revoke(inviteId: string): void {
    startTransition(async () => {
      const res = await revokeInviteAction(inviteId)
      if (res.ok) router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Members</h2>
        <p className="mt-1 text-sm text-muted">
          Invite people by email. They can view and add recordings in this workspace.
        </p>
      </div>

      <form onSubmit={invite} className="glass flex flex-wrap items-center gap-2 rounded-xl p-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="min-w-0 flex-1 rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'owner' | 'member')}
          className="rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none"
        >
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          Send invite
        </button>
      </form>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {notice && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-white/[0.02] p-3">
          <p className="text-sm text-muted">{notice}</p>
          {inviteLink && (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white/[0.04] px-2.5 py-2 text-xs text-ink">
                {inviteLink}
              </code>
              <button
                onClick={copyLink}
                className="btn-ghost shrink-0 px-3 py-2 text-xs"
                type="button"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const isSelf = m.userId === currentUserId
          const lastOwner = m.role === 'owner' && ownerCount <= 1
          return (
            <li
              key={m.userId}
              className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-4 py-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-xs font-bold text-ink">
                {(m.name || m.email).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {m.name} {isSelf && <span className="text-xs text-faint">(you)</span>}
                </div>
                <div className="truncate text-xs text-faint">{m.email}</div>
              </div>
              <span className="text-xs capitalize text-muted">{m.role}</span>
              {!isSelf && !lastOwner && (
                <button
                  onClick={() => remove(m.userId)}
                  disabled={pending}
                  className="text-xs text-faint transition hover:text-red-300 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
            Pending invites
          </h3>
          <ul className="flex flex-col gap-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{inv.email}</span>
                <span className="text-xs capitalize text-faint">{inv.role}</span>
                <button
                  onClick={() => revoke(inv.id)}
                  disabled={pending}
                  className="text-xs text-faint transition hover:text-red-300 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
