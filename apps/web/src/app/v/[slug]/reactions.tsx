'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactionMoment } from '@/db/reactions'
import { formatTimestamp, REACTIONS, type Reaction } from '@/lib/video-notes'
import { postReaction } from './actions'
import { usePlayer } from './player-context'

/** What each emoji is called for screen readers. */
const REACTION_NAMES: Record<Reaction, string> = {
  '👍': 'Thumbs up',
  '❤️': 'Love',
  '😂': 'Laugh',
  '🎉': 'Celebrate',
  '🤔': 'Thinking',
  '👀': 'Watching',
}

const VIEWER_KEY = 'lmsy-viewer-key'
const VIEWER_KEY_RE = /^[A-Za-z0-9-]{8,64}$/
/** Same as the server: one of each emoji per viewer this close together (video seconds). */
const REPEAT_S = 3
/** Marks this close (seconds) share one spot on the strip. */
const GROUP_S = 2
/** A mark's size in px. Marks that would overlap at the strip's width merge too. */
const MARK_PX = 24

const TIME_EVENTS = ['timeupdate', 'seeked', 'loadedmetadata', 'durationchange'] as const

export interface PlayerState {
  /** The player has loaded on the page. */
  attached: boolean
  /** Whole seconds into the video. */
  time: number
  /** Length in seconds, once known. */
  duration: number | null
  /** The viewer has pressed play at least once. */
  started: boolean
}

/**
 * Follows the share page's player: the current whole second, the length and
 * whether it's been played. Waits for the player to load, since it mounts
 * client-side after the page.
 */
export function usePlayerState(): PlayerState {
  const player = usePlayer()
  const [state, setState] = useState<PlayerState>({
    attached: false,
    time: 0,
    duration: null,
    started: false,
  })

  useEffect(() => {
    let el: EventTarget | null = null
    const sync = () => {
      const time = Math.floor(player.currentTime())
      const duration = player.duration()
      setState((prev) =>
        prev.attached && prev.time === time && prev.duration === duration
          ? prev
          : { ...prev, attached: true, time, duration },
      )
    }
    const onPlay = () => setState((prev) => (prev.started ? prev : { ...prev, started: true }))
    const attach = (): boolean => {
      const found = player.element() as unknown as EventTarget | null
      if (!found || typeof found.addEventListener !== 'function') return false
      el = found
      for (const type of TIME_EVENTS) el.addEventListener(type, sync)
      el.addEventListener('play', onPlay)
      sync()
      if (player.element()?.paused === false) onPlay()
      return true
    }
    let timer: number | undefined
    if (!attach()) {
      timer = window.setInterval(() => {
        if (attach()) window.clearInterval(timer)
      }, 300)
    }
    return () => {
      window.clearInterval(timer)
      if (!el) return
      for (const type of TIME_EVENTS) el.removeEventListener(type, sync)
      el.removeEventListener('play', onPlay)
    }
  }, [player])

  return state
}

function newViewerKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

interface Mark {
  at: number
  reactions: number
  comments: number
  byEmoji: Partial<Record<Reaction, number>>
}

/** Sorted moments into marks, each covering up to `span` seconds from its first item. */
function groupMarks(
  items: { at: number; emoji: Reaction | null; count: number }[],
  span: number,
): Mark[] {
  const marks: Mark[] = []
  for (const item of items) {
    let mark = marks[marks.length - 1]
    if (!mark || item.at - mark.at > span) {
      mark = { at: item.at, reactions: 0, comments: 0, byEmoji: {} }
      marks.push(mark)
    }
    if (item.emoji) {
      mark.reactions += item.count
      mark.byEmoji[item.emoji] = (mark.byEmoji[item.emoji] ?? 0) + item.count
    } else {
      mark.comments += item.count
    }
  }
  return marks
}

function topEmoji(mark: Mark): Reaction | null {
  let top: Reaction | null = null
  for (const r of REACTIONS) {
    if ((mark.byEmoji[r] ?? 0) > (top ? (mark.byEmoji[top] ?? 0) : 0)) top = r
  }
  return top
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function markLabel(mark: Mark): string {
  const parts: string[] = []
  if (mark.reactions) parts.push(plural(mark.reactions, 'reaction'))
  if (mark.comments) parts.push(plural(mark.comments, 'comment'))
  return `${parts.join(' and ')} at ${formatTimestamp(mark.at)}`
}

/** A quick float-up over the button that was tapped. Only mounted when motion is OK. */
function Burst({
  id,
  emoji,
  onDone,
}: {
  id: number
  emoji: Reaction
  onDone: (id: number) => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof node.animate !== 'function') {
      onDone(id)
      return
    }
    const anim = node.animate(
      [
        { transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -14px) scale(1.15)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -52px) scale(1)', opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    )
    anim.onfinish = () => onDone(id)
    return () => anim.cancel()
  }, [id, onDone])
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute bottom-full left-1/2 text-xl leading-none opacity-0"
    >
      {emoji}
    </span>
  )
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3 w-3 text-accent-ink" fill="currentColor">
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H7l-3.2 2.6c-.3.3-.8 0-.8-.4V11h-.5A1.5 1.5 0 0 1 2 9.5v-6Z" />
    </svg>
  )
}

/**
 * Emoji reactions under the share page's player, left at the current moment,
 * plus a strip showing where reactions and timestamped comments are.
 */
export function Reactions({
  slug,
  initialCounts,
  initialMoments,
  commentTimes,
}: {
  slug: string
  initialCounts: Record<Reaction, number>
  initialMoments: ReactionMoment[]
  /** Seconds that top-level comments point at. Follows the page (new comments revalidate it). */
  commentTimes: number[]
}) {
  const player = usePlayer()
  const { time, duration } = usePlayerState()
  const [counts, setCounts] = useState(initialCounts)
  const [moments, setMoments] = useState(initialMoments)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<Reaction | null>(null)
  const [bursts, setBursts] = useState<{ id: number; emoji: Reaction }[]>([])
  const [width, setWidth] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const viewerKey = useRef<string | null>(null)
  // This page's own taps, so a quick repeat is caught before it reaches the server.
  const mine = useRef<{ emoji: Reaction; at: number }[]>([])
  const burstId = useRef(0)
  const statusTimer = useRef<number | undefined>(undefined)
  const flashTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const node = root.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(statusTimer.current)
      window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const removeBurst = useCallback((id: number) => {
    setBursts((prev) => prev.filter((b) => b.id !== id))
  }, [])

  /** Kept in localStorage so a repeat visit is the same viewer; per page if that fails. */
  function getViewerKey(): string {
    if (viewerKey.current) return viewerKey.current
    let key: string | null = null
    try {
      key = localStorage.getItem(VIEWER_KEY)
      if (!key || !VIEWER_KEY_RE.test(key)) {
        key = newViewerKey()
        localStorage.setItem(VIEWER_KEY, key)
      }
    } catch {
      key ??= newViewerKey()
    }
    viewerKey.current = key
    return key
  }

  function announce(message: string): void {
    setStatus(message)
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(null), 2500)
  }

  function bump(emoji: Reaction, at: number, delta: number): void {
    setCounts((prev) => ({ ...prev, [emoji]: Math.max(0, prev[emoji] + delta) }))
    setMoments((prev) => {
      const i = prev.findIndex((m) => m.atSeconds === at && m.emoji === emoji)
      if (i === -1) return delta > 0 ? [...prev, { atSeconds: at, emoji, count: delta }] : prev
      const count = prev[i]!.count + delta
      return count > 0
        ? prev.map((m, j) => (j === i ? { ...m, count } : m))
        : prev.filter((_, j) => j !== i)
    })
  }

  async function react(emoji: Reaction): Promise<void> {
    const at = time
    setError(null)
    if (mine.current.some((m) => m.emoji === emoji && Math.abs(m.at - at) < REPEAT_S)) {
      announce(`You already added ${emoji} near ${formatTimestamp(at)}`)
      return
    }
    const entry = { emoji, at }
    mine.current.push(entry)

    // Feedback straight away; the count is put back if the server says no.
    bump(emoji, at, 1)
    announce(`Added ${emoji} at ${formatTimestamp(at)}`)
    setFlash(emoji)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 600)
    let reduceMotion = false
    try {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      /* ignore */
    }
    if (!reduceMotion) setBursts((prev) => [...prev, { id: ++burstId.current, emoji }])

    const res = await postReaction(slug, {
      emoji,
      atSeconds: at,
      viewerKey: getViewerKey(),
    }).catch(() => null)
    if (!res?.ok) {
      bump(emoji, at, -1)
      mine.current = mine.current.filter((m) => m !== entry)
      setStatus(null)
      setError(res?.error ?? "Couldn't add your reaction. Check your connection and try again.")
      return
    }
    if (!res.added) {
      // Left on an earlier visit, so it wasn't counted again.
      bump(emoji, at, -1)
      announce(`You already added ${emoji} near ${formatTimestamp(at)}`)
    } else if (res.atSeconds !== at) {
      bump(emoji, at, -1)
      bump(emoji, res.atSeconds, 1)
    }
  }

  // Reactions and comment times on one timeline, grouped into marks that don't overlap.
  const marks = useMemo(() => {
    if (!duration) return []
    const items = [
      ...moments.map((m) => ({ at: m.atSeconds, emoji: m.emoji, count: m.count })),
      ...commentTimes.map((at) => ({ at, emoji: null, count: 1 })),
    ].sort((a, b) => a.at - b.at)
    const usable = width - MARK_PX
    const span = usable > 0 ? Math.max(GROUP_S, (duration * MARK_PX) / usable) : GROUP_S
    return groupMarks(items, span)
  }, [moments, commentTimes, duration, width])

  const fraction = (at: number) => (duration ? Math.min(1, Math.max(0, at / duration)) : 0)

  return (
    <div
      ref={root}
      className="rise -mt-3 flex flex-col gap-3 px-2"
      style={{ animationDelay: '110ms' }}
    >
      {marks.length > 0 && (
        <div className="relative h-6">
          <div
            aria-hidden
            className="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full bg-accent/60" style={{ width: `${fraction(time) * 100}%` }} />
          </div>
          <ul aria-label="Moments in the video">
            {marks.map((mark) => {
              const label = markLabel(mark)
              const top = topEmoji(mark)
              return (
                <li
                  key={mark.at}
                  className="absolute top-0"
                  style={{ left: `calc((100% - ${MARK_PX}px) * ${fraction(mark.at)})` }}
                >
                  <button
                    type="button"
                    onClick={() => player.seek(mark.at)}
                    aria-label={label}
                    title={label}
                    className="relative grid h-6 w-6 place-items-center rounded-full border border-line-strong bg-canvas text-[0.8rem] leading-none transition hover:z-10 hover:scale-110 hover:border-ink focus-visible:z-10 motion-reduce:transition-none motion-reduce:hover:scale-100"
                  >
                    {top ? <span aria-hidden>{top}</span> : <CommentIcon />}
                    {top && mark.comments > 0 && (
                      <span
                        aria-hidden
                        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-accent"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          role="group"
          aria-label={`React at ${formatTimestamp(time)}`}
          className="flex flex-wrap gap-1.5"
        >
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void react(emoji)}
              aria-label={`${REACTION_NAMES[emoji]}, ${counts[emoji]} so far`}
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition motion-safe:active:scale-95 motion-reduce:transition-none ${
                flash === emoji
                  ? 'border-accent bg-accent/10'
                  : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {emoji}
              </span>
              <span
                aria-hidden
                className={`text-xs font-semibold tabular-nums ${counts[emoji] ? 'text-muted' : 'text-faint'}`}
              >
                {counts[emoji]}
              </span>
              {bursts
                .filter((b) => b.emoji === emoji)
                .map((b) => (
                  <Burst key={b.id} id={b.id} emoji={b.emoji} onDone={removeBurst} />
                ))}
            </button>
          ))}
        </div>
        <p className="text-xs text-faint">
          <span role="status" className="text-muted">
            {status ?? ''}
          </span>
          {!status && <span>React at {formatTimestamp(time)}</span>}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
