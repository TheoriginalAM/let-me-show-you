'use client'

import { useEffect, useState, useTransition } from 'react'
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
  const [copyFailed, setCopyFailed] = useState(false)
  // Which member's Remove has been pressed once (a second press removes them).
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ownerCount = members.filter((m) => m.role === 'owner').length

  useEffect(() => {
    if (!confirmRemove) return
    const t = setTimeout(() => setConfirmRemove(null), 3000)
    return () => clearTimeout(t)
  }, [confirmRemove])

  function invite(e: React.FormEvent): void {
    e.preventDefault()
    const value = email.trim()
    if (!value || pending) return
    setError(null)
    setNotice(null)
    setInviteLink(null)
    setCopied(false)
    setCopyFailed(false)
    startTransition(async () => {
      const res = await inviteMemberAction(value, role).catch(() => ({
        ok: false as const,
        error: "Couldn't send the invite. Check your connection and try again.",
      }))
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
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyFailed(true)
    }
  }

  function remove(userId: string): void {
    setConfirmRemove(null)
    setError(null)
    startTransition(async () => {
      const res = await removeMemberAction(userId).catch(() => ({
        ok: false,
        error: "Couldn't remove them. Check your connection and try again.",
      }))
      if (res.ok) router.refresh()
      else setError(res.error ?? "Couldn't remove them. Try again.")
    })
  }

  function revoke(inviteId: string): void {
    setError(null)
    startTransition(async () => {
      const res = await revokeInviteAction(inviteId).catch(() => ({
        ok: false,
        error: "Couldn't revoke the invite. Check your connection and try again.",
      }))
      if (res.ok) router.refresh()
      else setError(res.error ?? "Couldn't revoke the invite. Try again.")
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">Members</h2>
        <p className="mt-1 text-sm text-muted">
          Invite people by email. They can view and add recordings in this business.
        </p>
      </div>

      <form onSubmit={invite} className="glass flex flex-wrap items-center gap-2 rounded-xl p-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          aria-label="Email address to invite"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'owner' | 'member')}
          aria-label="Role"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
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
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
          <p role="status" className="text-sm text-muted">
            {notice}
          </p>
          {inviteLink && (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-2 text-xs text-ink">
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
          {copyFailed && (
            <p role="alert" className="text-xs text-muted">
              Could not copy. Select the link and copy it manually.
            </p>
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
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink">
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
                  onClick={() =>
                    confirmRemove === m.userId ? remove(m.userId) : setConfirmRemove(m.userId)
                  }
                  disabled={pending}
                  aria-label={`${confirmRemove === m.userId ? 'Confirm remove' : 'Remove'} ${m.name || m.email}`}
                  className={`rounded-lg px-2 py-1 text-xs transition disabled:opacity-50 ${
                    confirmRemove === m.userId
                      ? 'bg-danger font-medium text-on-danger'
                      : 'text-faint hover:text-danger'
                  }`}
                >
                  {confirmRemove === m.userId ? 'Confirm remove' : 'Remove'}
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
                  aria-label={`Revoke invite for ${inv.email}`}
                  className="text-xs text-faint transition hover:text-danger disabled:opacity-50"
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
