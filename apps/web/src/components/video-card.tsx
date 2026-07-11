'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDuration, type VideoStatus } from '@lmsy/shared'
import {
  renameVideoAction,
  setVideoPasswordAction,
  setVisibilityAction,
} from '@/app/dashboard/actions'

const STATUS_STYLES: Record<VideoStatus, string> = {
  ready: 'bg-green-500/15 text-green-300 ring-1 ring-inset ring-green-500/25',
  processing: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25',
  uploading: 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25',
  errored: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/25',
}

export type VideoCardProps = {
  id: string
  title: string
  slug: string
  shareUrl: string
  status: VideoStatus
  isPublic: boolean
  isProtected: boolean
  durationSeconds: number | null
  viewCount: number
  createdLabel: string
  thumbnailUrl: string | null
}

export function VideoCard(props: VideoCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)

  const [title, setTitle] = useState(props.title)
  const [isPublic, setIsPublic] = useState(props.isPublic)
  const [isProtected, setIsProtected] = useState(props.isProtected)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.title)
  const [copied, setCopied] = useState(false)
  const [managingPassword, setManagingPassword] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = pending || deleting

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(props.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy link')
    }
  }

  // Single commit path: Enter/Escape/click-away all blur the input, and this
  // runs once on blur. cancelRef distinguishes Escape (discard) from a real save.
  function commitRename() {
    setEditing(false)
    if (cancelRef.current) {
      cancelRef.current = false
      setDraft(title)
      return
    }
    const next = draft.trim()
    if (!next || next === title) {
      setDraft(title)
      return
    }
    const previous = title
    setTitle(next)
    setError(null)
    startTransition(async () => {
      const result = await renameVideoAction(props.id, next)
      if (!result.ok) {
        setTitle(previous)
        setError(result.error ?? 'Rename failed')
      }
    })
  }

  function toggleVisibility() {
    const next = !isPublic
    setIsPublic(next)
    setError(null)
    startTransition(async () => {
      const result = await setVisibilityAction(props.id, next)
      if (!result.ok) {
        setIsPublic(!next)
        setError(result.error ?? 'Update failed')
      }
    })
  }

  function savePassword() {
    const next = passwordDraft
    setError(null)
    startTransition(async () => {
      const result = await setVideoPasswordAction(props.id, next)
      if (result.ok) {
        setIsProtected(true)
        setManagingPassword(false)
        setPasswordDraft('')
      } else {
        setError(result.error ?? 'Could not set password')
      }
    })
  }

  function removePassword() {
    setError(null)
    startTransition(async () => {
      const result = await setVideoPasswordAction(props.id, null)
      if (result.ok) {
        setIsProtected(false)
        setManagingPassword(false)
        setPasswordDraft('')
      } else {
        setError(result.error ?? 'Could not remove password')
      }
    })
  }

  async function confirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/videos/${props.id}`, { method: 'DELETE' })
      if (res.status === 204) {
        router.refresh()
        return
      }
      setError('Delete failed')
    } catch {
      setError('Delete failed')
    } finally {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const thumbClickable = isPublic
  const Thumb = (
    <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-[linear-gradient(135deg,#14121f,#0c0b14)]">
      {props.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-faint">
          No preview yet
        </div>
      )}
      <span
        className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[props.status]}`}
      >
        {props.status}
      </span>
      {isProtected && (
        <span
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-accent-ink ring-1 ring-inset ring-accent/30 backdrop-blur"
          title="Password protected"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
      )}
      {props.durationSeconds != null && props.status === 'ready' && (
        <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
          {formatDuration(props.durationSeconds)}
        </span>
      )}
    </div>
  )

  return (
    <div className="glass glass-hover flex flex-col overflow-hidden rounded-xl">
      {thumbClickable ? (
        <a href={props.shareUrl} target="_blank" rel="noopener noreferrer" className="block">
          {Thumb}
        </a>
      ) : (
        Thumb
      )}

      <div className="flex flex-1 flex-col gap-3 p-3">
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                inputRef.current?.blur()
              }
              if (e.key === 'Escape') {
                cancelRef.current = true
                inputRef.current?.blur()
              }
            }}
            onBlur={commitRename}
            className="w-full rounded-lg border border-line bg-white/[0.03] px-2 py-1 text-sm font-medium text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
        ) : (
          <h3 className="truncate text-sm font-semibold text-ink" title={title}>
            {title}
          </h3>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          <span>{props.viewCount.toLocaleString()} views</span>
          <span aria-hidden>·</span>
          <span>{props.createdLabel}</span>
          <span aria-hidden>·</span>
          <span className={isPublic ? 'text-faint' : 'font-medium text-accent-ink'}>
            {isPublic ? 'Public' : 'Private'}
          </span>
          {isProtected && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-accent-ink">Protected</span>
            </>
          )}
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <button
            onClick={copyLink}
            disabled={busy}
            className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={() => {
              setDraft(title)
              setEditing(true)
            }}
            disabled={busy || editing}
            className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
          >
            Rename
          </button>
          <button
            onClick={toggleVisibility}
            disabled={busy}
            className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
          >
            {isPublic ? 'Make private' : 'Make public'}
          </button>
          <button
            onClick={() => {
              setPasswordDraft('')
              setManagingPassword((v) => !v)
            }}
            disabled={busy}
            className={`px-2 py-1 text-xs disabled:opacity-50 ${
              isProtected
                ? 'rounded-lg border border-accent/30 bg-accent-strong/15 font-medium text-accent-ink transition hover:bg-accent-strong/25'
                : 'btn-ghost'
            }`}
          >
            {isProtected ? 'Password ✓' : 'Password'}
          </button>

          {confirmingDelete ? (
            <span className="ml-auto flex items-center gap-1.5">
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-500 px-2 py-1 text-xs font-medium text-white shadow-[0_10px_24px_-12px_rgba(239,68,68,0.8)] transition hover:bg-red-400 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              className="ml-auto rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/20 hover:border-red-500/40 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>

        {managingPassword && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-white/[0.02] p-2.5">
            <input
              type="password"
              autoFocus
              value={passwordDraft}
              onChange={(e) => setPasswordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && passwordDraft) {
                  e.preventDefault()
                  savePassword()
                }
                if (e.key === 'Escape') {
                  setManagingPassword(false)
                  setPasswordDraft('')
                }
              }}
              placeholder={isProtected ? 'New password' : 'Set a password'}
              className="w-full rounded-lg border border-line bg-white/[0.03] px-2 py-1 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={savePassword}
                disabled={busy || !passwordDraft}
                className="btn-primary px-2.5 py-1 text-xs disabled:opacity-50"
              >
                Save
              </button>
              {isProtected && (
                <button
                  onClick={removePassword}
                  disabled={busy}
                  className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-300 transition hover:border-red-500/40 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => {
                  setManagingPassword(false)
                  setPasswordDraft('')
                }}
                disabled={busy}
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-faint">
              Anyone with the link must enter this password to watch.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
