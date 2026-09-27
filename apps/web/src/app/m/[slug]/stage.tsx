'use client'

import { useEffect, useRef, useState } from 'react'
import {
  isTrackReference,
  useConnectionQualityIndicator,
  useDataChannel,
  useIsMuted,
  useIsSpeaking,
  useParticipantAttribute,
  useSpeakingParticipants,
  useTracks,
  VideoTrack,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react'
import { ConnectionQuality, Track } from 'livekit-client'
import { useMeetPrefs } from './_lib/prefs'
import { useCall } from './call-context'
import { HandIcon, MicOffIcon, PinIcon } from './icons'
import { cx } from './ui'

export const REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉'] as const

export function trackKey(t: TrackReferenceOrPlaceholder): string {
  return `${t.participant.identity}:${t.source}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = (): void => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return narrow
}

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

export function Tile({
  trackRef,
  variant,
}: {
  trackRef: TrackReferenceOrPlaceholder
  variant: 'grid' | 'focus' | 'strip' | 'self'
}) {
  const p = trackRef.participant
  const isShare = trackRef.source === Track.Source.ScreenShare
  const speaking = useIsSpeaking(p)
  const { quality } = useConnectionQualityIndicator({ participant: p })
  const hand = useParticipantAttribute('hand', { participant: p })
  const role = useParticipantAttribute('role', { participant: p })
  const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone })
  const videoMuted = useIsMuted(trackRef)
  const [prefs] = useMeetPrefs()
  const { pinned, setPinned } = useCall()

  const key = trackKey(trackRef)
  const isPinned = pinned === key
  const showVideo = isTrackReference(trackRef) && !videoMuted
  const mirror = p.isLocal && !isShare && prefs.mirror
  const name = p.name || (p.isLocal ? 'You' : 'Guest')
  const label = `${name}${p.isLocal ? ' (you)' : ''}${isShare ? ', screen' : ''}${
    role === 'host' ? ', host' : ''
  }${speaking && !isShare ? ', speaking' : ''}${micMuted && !isShare ? ', microphone off' : ''}`
  const poor = quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost
  const compact = variant === 'strip' || variant === 'self'

  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'group relative h-full w-full overflow-hidden bg-[#101019]',
        variant === 'self' ? 'rounded-xl shadow-2xl ring-1 ring-white/15' : 'rounded-2xl',
      )}
    >
      {showVideo && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          className={cx(
            'h-full w-full',
            isShare ? 'bg-black object-contain' : 'object-cover',
            mirror && '-scale-x-100',
          )}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-b from-[var(--room-accent-soft)] to-transparent">
          <span
            className={cx(
              'grid place-items-center rounded-full bg-[var(--room-accent-soft)] font-display font-semibold text-ink ring-1 ring-white/10',
              compact ? 'h-12 w-12 text-base' : 'h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl',
            )}
          >
            {initials(name)}
          </span>
        </div>
      )}

      {/* Speaking ring */}
      {speaking && !isShare && (
        <span
          className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-[var(--room-accent-ring)] shadow-[inset_0_0_24px_-8px_var(--room-accent-ring)]"
          aria-hidden
        />
      )}

      {/* Top-left: hand + connection */}
      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        {hand && (
          <span className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-xs font-semibold text-black shadow">
            <HandIcon size={14} />
            {!compact && 'Hand raised'}
          </span>
        )}
        {poor && (
          <span
            className="h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-black/40"
            title="Poor connection"
            aria-label="Poor connection"
          />
        )}
      </div>

      {/* Pin (for me) */}
      {variant !== 'self' && (
        <button
          type="button"
          onClick={() => setPinned(isPinned ? null : key)}
          aria-label={isPinned ? `Unpin ${name}` : `Pin ${name} for me`}
          aria-pressed={isPinned}
          className={cx(
            'absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-ink backdrop-blur transition focus-visible:opacity-100',
            isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          <PinIcon size={15} />
        </button>
      )}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-xs text-ink backdrop-blur sm:text-[13px]">
        {micMuted && !isShare && <MicOffIcon size={13} className="shrink-0 text-red-300" />}
        <span className="truncate font-medium">
          {name}
          {p.isLocal && !isShare && ' (you)'}
          {isShare && ' · screen'}
        </span>
        {role === 'host' && !compact && (
          <span className="shrink-0 rounded bg-[var(--room-accent)] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[var(--room-accent-fg)]">
            Host
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage: Auto / Grid / Speaker, pinning, floating self-view
// ---------------------------------------------------------------------------

export function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const speakers = useSpeakingParticipants()
  const { layout, pinned } = useCall()
  const [prefs] = useMeetPrefs()
  const narrow = useIsNarrow()
  const [activeId, setActiveId] = useState<string | null>(null)

  // Remember the last remote person who spoke (so Speaker view doesn't flicker).
  useEffect(() => {
    const s = speakers.find((p) => !p.isLocal)
    if (s) setActiveId(s.identity)
  }, [speakers])

  // Never show your own screen share back to you (hall of mirrors).
  const visible = tracks.filter(
    (t) => !(t.source === Track.Source.ScreenShare && t.participant.isLocal),
  )
  const remoteShares = visible.filter((t) => t.source === Track.Source.ScreenShare)
  const cams = visible.filter((t) => t.source === Track.Source.Camera)
  const localCam = cams.find((t) => t.participant.isLocal)
  const remoteCams = cams.filter((t) => !t.participant.isLocal)

  let focus: TrackReferenceOrPlaceholder | undefined = pinned
    ? visible.find((t) => trackKey(t) === pinned)
    : undefined
  if (!focus && layout !== 'grid') {
    focus = remoteShares[0]
    if (!focus && (layout === 'speaker' || (layout === 'auto' && remoteCams.length === 1))) {
      focus = remoteCams.find((t) => t.participant.identity === activeId) ?? remoteCams[0]
    }
  }

  if (focus) {
    const focusIsSelf = focus === localCam
    const rest = visible.filter((t) => t !== focus && t !== localCam)
    const showSelf = !!localCam && !focusIsSelf && !prefs.hideSelf
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="relative min-h-0 flex-1">
          <Tile trackRef={focus} variant="focus" />
          {showSelf && (
            <div className="absolute bottom-3 right-3 z-10 aspect-video w-32 sm:w-52">
              <Tile trackRef={localCam} variant="self" />
            </div>
          )}
        </div>
        {rest.length > 0 && (
          <div className="flex h-24 shrink-0 gap-3 overflow-x-auto pb-1 sm:h-28" aria-label="Other people">
            {rest.map((t) => (
              <div key={trackKey(t)} className="aspect-video h-full shrink-0">
                <Tile trackRef={t} variant="strip" />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Grid. "Hide self view" drops you only when someone else is there to see.
  const grid = prefs.hideSelf && visible.length > 1 ? visible.filter((t) => t !== localCam) : visible
  return <GridStage tracks={grid} narrow={narrow} />
}

const GAP = 12
const MIN_TILE_W = 240

/**
 * Largest 16:9 tile size that fits `n` tiles into W×H (Meet-style gallery).
 * The gap is applied in px inline (not a Tailwind class: the 18px root font
 * would make a rem gap wider than this maths assumes and force a wrap).
 */
function bestFit(n: number, width: number, height: number): { w: number; h: number } {
  const W = width - 1 // sub-pixel safety so a full row never wraps
  const H = height - 1
  let best = { w: 0, h: 0 }
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const w = Math.min((W - GAP * (cols - 1)) / cols, ((H - GAP * (rows - 1)) / rows) * (16 / 9))
    if (w > best.w) best = { w, h: (w * 9) / 16 }
  }
  return { w: Math.floor(best.w), h: Math.floor(best.h) }
}

function GridStage({ tracks, narrow }: { tracks: TrackReferenceOrPlaceholder[]; narrow: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const n = Math.max(1, tracks.length)

  // Phones (portrait): tiles fill the screen, like a phone call.
  if (narrow) {
    const cols = n <= 2 ? 1 : 2
    const rows = Math.ceil(n / cols)
    const scroll = rows > 3
    return (
      <div
        ref={ref}
        className={cx('grid h-full min-h-0 gap-3', scroll && 'overflow-y-auto')}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: scroll ? undefined : `repeat(${rows}, minmax(0, 1fr))`,
          gridAutoRows: scroll ? '30vh' : undefined,
        }}
      >
        {tracks.map((t) => (
          <Tile key={trackKey(t)} trackRef={t} variant="grid" />
        ))}
      </div>
    )
  }

  // Wider screens: uncropped 16:9 tiles, as large as fit; scroll once they'd
  // get too small to see anyone.
  let { w, h } = bestFit(n, size.w, size.h)
  const scroll = size.w > 0 && w < MIN_TILE_W
  if (scroll) {
    const cols = Math.max(1, Math.floor((size.w - 1 + GAP) / (MIN_TILE_W + GAP)))
    w = Math.floor((size.w - 1 - GAP * (cols - 1)) / cols)
    h = Math.floor((w * 9) / 16)
  }
  return (
    <div
      ref={ref}
      className={cx(
        'flex h-full min-h-0 flex-wrap justify-center',
        scroll ? 'content-start overflow-y-auto' : 'content-center',
      )}
      style={{ gap: GAP }}
    >
      {size.w > 0 &&
        tracks.map((t) => (
          <div key={trackKey(t)} style={{ width: w, height: h }}>
            <Tile trackRef={t} variant="grid" />
          </div>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reactions: short-lived emoji that float up, labelled with who sent them.
// The sender comes from LiveKit (it stamps every data packet), never the payload.
// ---------------------------------------------------------------------------

interface Floating {
  id: number
  emoji: string
  name: string
  left: number
}

let reactionSeq = 0

export function useReactionFeed() {
  const [items, setItems] = useState<Floating[]>([])
  const add = (emoji: string, name: string): void => {
    const id = ++reactionSeq
    setItems((cur) => [...cur.slice(-12), { id, emoji, name, left: 8 + Math.random() * 30 }])
    setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), 2800)
  }
  return { items, add }
}

export function ReactionsLayer({
  items,
  onRemote,
}: {
  items: Floating[]
  onRemote: (emoji: string, name: string) => void
}) {
  useDataChannel('reaction', (msg) => {
    if (!msg.from) return
    try {
      const { i } = JSON.parse(new TextDecoder().decode(msg.payload)) as { i: number }
      const emoji = REACTIONS[i]
      if (emoji) onRemote(emoji, msg.from.name || 'Someone')
    } catch {
      // ignore malformed
    }
  })
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-live="polite">
      {items.map((r) => (
        <div
          key={r.id}
          className="reaction-float absolute bottom-24 flex flex-col items-center"
          style={{ left: `${r.left}%` }}
        >
          <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
          <span className="mt-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-ink">{r.name}</span>
        </div>
      ))}
    </div>
  )
}
