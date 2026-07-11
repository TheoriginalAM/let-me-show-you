'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDuration, type VideoStatus } from '@lmsy/shared'
import { renameVideoAction, setVisibilityAction } from '@/app/dashboard/actions'

const STATUS_STYLES: Record<VideoStatus, string> = {
  ready: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  processing: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  uploading: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  errored: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export type VideoCardProps = {
  id: string
  title: string
  slug: string
  shareUrl: string
  status: VideoStatus
  isPublic: boolean
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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.title)
  const [copied, setCopied] = useState(false)
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
    <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-neutral-100 dark:bg-neutral-900">
      {props.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
          No preview yet
        </div>
      )}
      <span
        className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[props.status]}`}
      >
        {props.status}
      </span>
      {props.durationSeconds != null && props.status === 'ready' && (
        <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
          {formatDuration(props.durationSeconds)}
        </span>
      )}
    </div>
  )

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
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
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-900"
          />
        ) : (
          <h3 className="truncate text-sm font-semibold" title={title}>
            {title}
          </h3>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          <span>{props.viewCount.toLocaleString()} views</span>
          <span aria-hidden>·</span>
          <span>{props.createdLabel}</span>
          <span aria-hidden>·</span>
          <span
            className={
              isPublic ? 'text-neutral-500' : 'font-medium text-neutral-700 dark:text-neutral-300'
            }
          >
            {isPublic ? 'Public' : 'Private'}
          </span>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <button
            onClick={copyLink}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            onClick={() => {
              setDraft(title)
              setEditing(true)
            }}
            disabled={busy || editing}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Rename
          </button>
          <button
            onClick={toggleVisibility}
            disabled={busy}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {isPublic ? 'Make private' : 'Make public'}
          </button>

          {confirmingDelete ? (
            <span className="ml-auto flex items-center gap-1.5">
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              className="ml-auto rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
