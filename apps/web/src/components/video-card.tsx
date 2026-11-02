'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDuration, type VideoStatus } from '@lmsy/shared'
import {
  renameVideoAction,
  setApprovalEnabledAction,
  setDescriptionAction,
  setVideoPasswordAction,
  setVisibilityAction,
} from '@/app/dashboard/actions'

// Pills sit on the thumbnail, so they're solid dark with white text whatever
// the page theme; the dot carries the colour.
const STATUS: Record<VideoStatus, { label: string; dot: string }> = {
  ready: { label: 'Ready', dot: 'bg-hl-green' },
  processing: { label: 'Processing', dot: 'bg-hl-orange' },
  uploading: { label: 'Uploading', dot: 'bg-hl-sky' },
  errored: { label: 'Failed', dot: 'bg-red-400' },
}

const NETWORK_HINT = 'Check your connection and try again.'

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
  commentCount: number
  description: string | null
  approvalEnabled: boolean
  approvalCounts: { approved: number; changes: number }
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
  const [description, setDescription] = useState(props.description)
  const [managingDescription, setManagingDescription] = useState(false)
  const [descDraft, setDescDraft] = useState(props.description ?? '')
  const [approvalOn, setApprovalOn] = useState(props.approvalEnabled)
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
      setError(`Couldn't copy. Here's the link to copy yourself: ${props.shareUrl}`)
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
      const result = await renameVideoAction(props.id, next).catch(() => ({
        ok: false,
        error: undefined,
      }))
      if (!result.ok) {
        setTitle(previous)
        setError(result.error ?? `Couldn't rename the video. ${NETWORK_HINT}`)
      }
    })
  }

  function toggleVisibility() {
    const next = !isPublic
    setIsPublic(next)
    setError(null)
    startTransition(async () => {
      const result = await setVisibilityAction(props.id, next).catch(() => ({
        ok: false,
        error: undefined,
      }))
      if (!result.ok) {
        setIsPublic(!next)
        setError(
          result.error ?? `Couldn't make the video ${next ? 'public' : 'private'}. ${NETWORK_HINT}`,
        )
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

  function saveDescription() {
    const next = descDraft.trim()
    setError(null)
    startTransition(async () => {
      const result = await setDescriptionAction(props.id, next || null)
      if (result.ok) {
        setDescription(next || null)
        setManagingDescription(false)
      } else {
        setError(result.error ?? 'Could not save description')
      }
    })
  }

  function toggleApproval() {
    const next = !approvalOn
    setApprovalOn(next)
    setError(null)
    startTransition(async () => {
      const result = await setApprovalEnabledAction(props.id, next).catch(() => ({
        ok: false,
        error: undefined,
      }))
      if (!result.ok) {
        setApprovalOn(!next)
        setError(result.error ?? `Couldn't turn approval ${next ? 'on' : 'off'}. ${NETWORK_HINT}`)
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
      setError(`Couldn't delete the video. Refresh the page and try again.`)
    } catch {
      setError(`Couldn't delete the video. ${NETWORK_HINT}`)
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
      <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/75 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${STATUS[props.status].dot}`} aria-hidden />
        {STATUS[props.status].label}
      </span>
      {isProtected && (
        // "Protected" is also spelled out under the title, so this is visual only.
        <span
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/75 text-white backdrop-blur"
          title="Password protected"
          aria-hidden
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
        <a
          href={props.shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Watch ${title} (opens in a new tab)`}
          className="block"
        >
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
            aria-label="Video title"
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
            className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm font-medium text-ink placeholder:text-faint focus:border-ink focus:outline-none"
          />
        ) : (
          <h3 className="truncate text-sm font-semibold text-ink" title={title}>
            {title}
          </h3>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          <span>{props.viewCount.toLocaleString()} views</span>
          {props.commentCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-accent-ink">
                {props.commentCount} {props.commentCount === 1 ? 'comment' : 'comments'}
              </span>
            </>
          )}
          {props.approvalCounts.approved > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-success">
                {props.approvalCounts.approved} approved
              </span>
            </>
          )}
          {props.approvalCounts.changes > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-warning">
                {props.approvalCounts.changes} changes
              </span>
            </>
          )}
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

        {error && (
          <p role="alert" className="break-words text-xs text-danger">
            {error}
          </p>
        )}

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
            aria-expanded={managingPassword}
            className={`px-2 py-1 text-xs disabled:opacity-50 ${
              isProtected
                ? 'rounded-lg border border-accent/30 bg-accent-strong/15 font-medium text-accent-ink transition hover:bg-accent-strong/25'
                : 'btn-ghost'
            }`}
          >
            {isProtected ? 'Password ✓' : 'Password'}
          </button>
          <button
            onClick={() => {
              setDescDraft(description ?? '')
              setManagingDescription((v) => !v)
            }}
            disabled={busy}
            aria-expanded={managingDescription}
            className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
          >
            {description ? 'Description ✓' : 'Description'}
          </button>
          {/* A true toggle: the name stays put and aria-pressed carries the state. */}
          <button
            onClick={toggleApproval}
            disabled={busy}
            aria-pressed={approvalOn}
            className={`px-2 py-1 text-xs disabled:opacity-50 ${
              approvalOn
                ? 'rounded-lg border border-accent/30 bg-accent-strong/15 font-medium text-accent-ink transition hover:bg-accent-strong/25'
                : 'btn-ghost'
            }`}
            title="Show Approve and Request changes buttons on the share page"
          >
            Ask for approval{approvalOn && <span aria-hidden> ✓</span>}
          </button>

          {confirmingDelete ? (
            <span className="ml-auto flex items-center gap-1.5">
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-danger px-2 py-1 text-xs font-medium text-on-danger transition hover:opacity-90 disabled:opacity-50"
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
              className="ml-auto rounded-lg border border-danger/25 bg-danger/10 px-2 py-1 text-xs font-medium text-danger transition hover:bg-danger/20 hover:border-danger/40 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>

        {managingDescription && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2.5">
            <textarea
              autoFocus
              aria-label="Description"
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Add a description shown under the video on its share page…"
              className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={saveDescription}
                disabled={busy}
                className="btn-primary px-2.5 py-1 text-xs disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setManagingDescription(false)
                  setDescDraft(description ?? '')
                }}
                disabled={busy}
                className="btn-ghost px-2 py-1 text-xs disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {managingPassword && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2.5">
            <input
              type="password"
              autoFocus
              aria-label={isProtected ? 'New video password' : 'Video password'}
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
              className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
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
                  className="rounded-lg border border-danger/25 bg-danger/10 px-2 py-1 text-xs font-medium text-danger transition hover:border-danger/40 hover:bg-danger/20 disabled:opacity-50"
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
