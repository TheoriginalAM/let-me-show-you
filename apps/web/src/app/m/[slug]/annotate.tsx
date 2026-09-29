'use client'

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocalParticipant, useRoomContext, VideoTrack } from '@livekit/components-react'
import {
  ParticipantEvent,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type TrackPublication,
} from 'livekit-client'
import {
  ANNOTATE_TOPIC,
  annotationStore,
  colorFor,
  decodeAnnotate,
  encodeAnnotate,
  INK_FADE_MS,
  INK_HOLD_MS,
  MAX_POINTS_PER_MESSAGE,
  MAX_POINTS_PER_STROKE,
  useShareMarks,
  useTool,
  type AnnotateMessage,
  type Pt,
  type Stroke,
  type Tool,
} from './_lib/annotations'
import { brandVars } from './_lib/brand'
import { useCall } from './call-context'
import { CloseIcon, EraserIcon, PenIcon, PointerIcon, PopOutIcon } from './icons'
import { cx } from './ui'

/** Where a picture sits inside its box with object-fit: contain. */
export function containRect(
  box: { w: number; h: number },
  ratio: number,
): { left: number; top: number; width: number; height: number } {
  if (box.w / box.h > ratio) {
    const width = box.h * ratio
    return { left: (box.w - width) / 2, top: 0, width, height: box.h }
  }
  const height = box.w / ratio
  return { left: 0, top: (box.h - height) / 2, width: box.w, height }
}

/**
 * Your own screen share, as shown back to you. A shared tab or app window can
 * be shown live. A whole screen can't: the call would film itself filming
 * itself (a tunnel that also blurs the share for everyone), so it gets a plain
 * placeholder the pointers are drawn on. Unknown counts as a whole screen.
 */
export function ownShareInfo(track: MediaStreamTrack | undefined): { live: boolean; ratio: number } {
  let settings: MediaTrackSettings & { displaySurface?: string } = {}
  try {
    settings = track?.getSettings() ?? {}
  } catch {
    // ended
  }
  const live = settings.displaySurface === 'browser' || settings.displaySurface === 'window'
  const ratio = settings.width && settings.height ? settings.width / settings.height : 16 / 9
  return { live, ratio }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const POINTER_EVERY_MS = 40 // ~25 updates a second
const STROKE_FLUSH_MS = 50
/** Points closer than this (in picture units) add nothing but traffic. */
const MIN_STEP = 0.002

function useSender(share: string) {
  const room = useRoomContext()
  const store = annotationStore(room)
  const me = room.localParticipant

  const send = useCallback(
    (m: AnnotateMessage, reliable: boolean) => {
      me.publishData(encodeAnnotate(m), { reliable, topic: ANNOTATE_TOPIC }).catch(() => undefined)
    },
    [me],
  )

  // Pointer: throttled; the latest position is always sent eventually.
  const lastSent = useRef(0)
  const pending = useRef<{ x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointing = useRef(false)
  const pointer = useCallback(
    (x: number, y: number) => {
      pointing.current = true
      store.laser(share, { who: me.identity, name: 'You', color: colorFor(me.identity), x, y })
      pending.current = { x, y }
      const flush = (): void => {
        timer.current = null
        if (!pending.current) return
        lastSent.current = Date.now()
        send({ k: 'p', s: share, ...pending.current }, false)
        pending.current = null
      }
      const wait = POINTER_EVERY_MS - (Date.now() - lastSent.current)
      if (wait <= 0) flush()
      else if (!timer.current) timer.current = setTimeout(flush, wait)
    },
    [store, share, me, send],
  )
  const pointerEnd = useCallback(() => {
    if (!pointing.current) return
    pointing.current = false
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    store.laserEnd(share, me.identity)
    send({ k: 'pe', s: share }, true)
  }, [store, share, me, send])

  // Strokes: points are shown straight away and sent in small batches.
  const stroke = useRef<{
    id: string
    buf: Pt[]
    count: number
    last: Pt
    timer: ReturnType<typeof setTimeout> | null
  } | null>(null)
  const flushStroke = useCallback(
    (done: boolean) => {
      const s = stroke.current
      if (!s) return
      if (s.timer) clearTimeout(s.timer)
      s.timer = null
      if (s.buf.length || done) send({ k: 's', s: share, i: s.id, p: s.buf, d: done }, true)
      s.buf = []
      if (done) stroke.current = null
    },
    [share, send],
  )
  /** Lift the pen: finished here and for everyone (then it fades). */
  const penUp = useCallback(() => {
    const s = stroke.current
    if (!s) return
    store.stroke(share, me.identity, s.id, colorFor(me.identity), [], true)
    flushStroke(true)
  }, [store, share, me, flushStroke])
  const penDown = useCallback(
    (x: number, y: number) => {
      penUp() // never leave a stroke hanging
      const id = Math.random().toString(36).slice(2, 10)
      stroke.current = { id, buf: [[x, y]], count: 1, last: [x, y], timer: null }
      store.stroke(share, me.identity, id, colorFor(me.identity), [[x, y]], false)
    },
    [store, share, me, penUp],
  )
  const penMove = useCallback(
    (x: number, y: number) => {
      let s = stroke.current
      if (!s) return
      if (Math.hypot(x - s.last[0], y - s.last[1]) < MIN_STEP) return
      // A long gesture carries on as a new stroke before the size cap, rather
      // than silently stopping.
      if (s.count >= MAX_POINTS_PER_STROKE - 1) {
        penDown(s.last[0], s.last[1])
        s = stroke.current
        if (!s) return
      }
      s.buf.push([x, y])
      s.count++
      s.last = [x, y]
      store.stroke(share, me.identity, s.id, colorFor(me.identity), [[x, y]], false)
      if (s.buf.length >= MAX_POINTS_PER_MESSAGE) flushStroke(false)
      else if (!s.timer) s.timer = setTimeout(() => flushStroke(false), STROKE_FLUSH_MS)
    },
    [store, share, me, flushStroke, penDown],
  )

  const clearMine = useCallback(() => {
    store.clear(share, me.identity)
    send({ k: 'c', s: share }, true)
  }, [store, share, me, send])

  // Leaving mid-stroke or mid-point: finish up, here and for everyone.
  useEffect(
    () => () => {
      penUp()
      pointerEnd()
    },
    [penUp, pointerEnd],
  )

  return { pointer, pointerEnd, penDown, penMove, penUp, clearMine }
}

// ---------------------------------------------------------------------------
// Receiving (once per call)
// ---------------------------------------------------------------------------

/** Per-sender cap on incoming packets (a little above what a real pointer sends). */
const MAX_PER_SECOND = 90
const NOTIFY_EVERY_MS = 60_000

/**
 * Applies everyone's pointers and ink to the store, drops the marks of people
 * who leave and of shares that end, and tells the presenter when someone
 * starts pointing at their screen (they're usually looking at another app).
 * Listens to the room directly: packets only touch the store (and so only the
 * marks layer re-renders), never the rest of the call.
 */
export function useAnnotationSync(): void {
  const room = useRoomContext()
  const { notify } = useCall()
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  useEffect(() => {
    const store = annotationStore(room)
    const budget = new Map<string, { at: number; n: number }>()
    const told = new Map<string, number>()
    const lp = room.localParticipant
    /** Only marks on a screen that's actually being shared count. */
    const sharing = (identity: string): boolean =>
      identity === lp.identity
        ? !!lp.getTrackPublication(Track.Source.ScreenShare)?.track
        : !!room.getParticipantByIdentity(identity)?.getTrackPublication(Track.Source.ScreenShare)

    const onData = (payload: Uint8Array, from?: RemoteParticipant, _kind?: unknown, topic?: string): void => {
      if (topic !== ANNOTATE_TOPIC || !from) return
      const now = Date.now()
      const b = budget.get(from.identity)
      if (!b || now - b.at > 1000) budget.set(from.identity, { at: now, n: 1 })
      else if (++b.n > MAX_PER_SECOND) return
      if (budget.size > 200) budget.clear()

      const m = decodeAnnotate(payload)
      if (!m || !sharing(m.s)) return
      const color = colorFor(from.identity)
      const name = from.name || 'Guest'
      switch (m.k) {
        case 'p':
          store.laser(m.s, { who: from.identity, name, color, x: m.x, y: m.y })
          break
        case 'pe':
          store.laserEnd(m.s, from.identity)
          return
        case 's':
          store.stroke(m.s, from.identity, m.i, color, m.p, m.d)
          break
        case 'c':
          store.clear(m.s, from.identity)
          return
      }
      // Someone started marking up *my* screen: make sure I know.
      if (m.s === lp.identity && !popOutOpen) {
        const last = told.get(from.identity) ?? 0
        if (now - last > NOTIFY_EVERY_MS) {
          told.set(from.identity, now)
          if (store.openPopOut) {
            notifyRef.current(`${name} is pointing at your screen.`, 'info', {
              label: 'Show me',
              run: () => store.openPopOut?.(),
            })
          } else {
            notifyRef.current(`${name} is pointing at your screen. Come back to this tab to see where.`, 'info')
          }
        }
      }
    }
    const onLeft = (p: Participant): void => store.forget(p.identity)
    const onUnpublished = (pub: TrackPublication, p: Participant): void => {
      if (pub.source === Track.Source.ScreenShare) store.clearShare(p.identity)
    }
    const onLocalUnpublished = (pub: TrackPublication): void => {
      if (pub.source === Track.Source.ScreenShare) store.clearShare(lp.identity)
    }
    room.on(RoomEvent.DataReceived, onData)
    room.on(RoomEvent.ParticipantDisconnected, onLeft)
    room.on(RoomEvent.TrackUnpublished, onUnpublished)
    lp.on(ParticipantEvent.LocalTrackUnpublished, onLocalUnpublished)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
      room.off(RoomEvent.ParticipantDisconnected, onLeft)
      room.off(RoomEvent.TrackUnpublished, onUnpublished)
      lp.off(ParticipantEvent.LocalTrackUnpublished, onLocalUnpublished)
      store.setTool('none') // leaving the call: put the tool away
    }
  }, [room])
}

// ---------------------------------------------------------------------------
// The layer drawn over a shared screen
// ---------------------------------------------------------------------------

/**
 * One stroke of ink. Memoised on the stroke (unchanged strokes keep their
 * object), so a moving pointer doesn't rebuild every line. The fade is timed
 * from when the pen lifted, worked out once: a window opened later shows ink
 * part-way through its life, and re-renders never restart it.
 */
const InkStroke = memo(function InkStroke({ stroke }: { stroke: Stroke }) {
  const delay = useMemo(
    () => (stroke.endedAt === null ? null : INK_HOLD_MS - (Date.now() - stroke.endedAt)),
    [stroke.endedAt],
  )
  return (
    <polyline
      points={stroke.pts.map(([x, y]) => `${x},${y}`).join(' ')}
      fill="none"
      stroke={stroke.color}
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
      style={delay === null ? undefined : { animation: `annotate-fade ${INK_FADE_MS}ms ease ${delay}ms forwards` }}
    />
  )
})

/**
 * Pointers and ink over a shared screen. `rect` is where the picture sits in
 * its tile. With `interactive`, the Point/Draw tools act on it; otherwise it
 * only shows marks (and lets clicks through).
 */
export function AnnotationLayer({
  share,
  rect,
  interactive,
}: {
  share: string
  rect: { left: number; top: number; width: number; height: number }
  interactive: boolean
}) {
  const room = useRoomContext()
  const marks = useShareMarks(room, share)
  const [tool] = useTool(room)
  const active = interactive && tool !== 'none'
  const sender = useSender(share)
  const layer = useRef<HTMLDivElement>(null)
  // The one finger/mouse button in use; others (a second finger, a palm) are ignored.
  const activePointer = useRef<number | null>(null)
  const drawing = useRef(false)

  const at = (e: ReactPointerEvent): { x: number; y: number } => {
    const r = layer.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  const finish = (): void => {
    activePointer.current = null
    if (drawing.current) {
      drawing.current = false
      sender.penUp()
    }
  }

  // Switching tools (or turning them off) ends whatever was in progress.
  useEffect(() => {
    if (tool !== 'point') sender.pointerEnd()
    if (tool !== 'draw') finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on tool change
  }, [tool])

  const handlers = active
    ? {
        onPointerDown: (e: ReactPointerEvent) => {
          if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
          if (activePointer.current !== null) return
          activePointer.current = e.pointerId
          try {
            // Keep getting moves if the pen strays off the picture mid-stroke.
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // No such active pointer (e.g. a synthetic event): carry on without capture.
          }
          const p = at(e)
          if (tool === 'draw') {
            drawing.current = true
            sender.penDown(p.x, p.y)
          } else sender.pointer(p.x, p.y)
        },
        onPointerMove: (e: ReactPointerEvent) => {
          if (!e.isPrimary) return
          const p = at(e)
          if (tool === 'draw') {
            if (!drawing.current || e.pointerId !== activePointer.current) return
            // The button came up somewhere we didn't hear about: lift the pen.
            if (e.pointerType === 'mouse' && e.buttons === 0) return finish()
            sender.penMove(p.x, p.y)
          } else if (e.pointerType === 'mouse' || e.pointerId === activePointer.current) {
            // A mouse points just by hovering; a finger or pen while touching.
            sender.pointer(p.x, p.y)
          }
        },
        onPointerUp: (e: ReactPointerEvent) => {
          if (e.pointerId !== activePointer.current) return
          if (tool === 'point' && e.pointerType !== 'mouse') sender.pointerEnd()
          finish()
        },
        onPointerCancel: (e: ReactPointerEvent) => {
          if (e.pointerId !== activePointer.current) return
          sender.pointerEnd()
          finish()
        },
        onLostPointerCapture: (e: ReactPointerEvent) => {
          if (e.pointerId === activePointer.current) finish()
        },
        onPointerLeave: (e: ReactPointerEvent) => {
          if (tool === 'point' && e.pointerType === 'mouse') sender.pointerEnd()
        },
      }
    : {}

  const style: CSSProperties = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    cursor: active ? (tool === 'draw' ? 'crosshair' : 'none') : undefined,
    touchAction: active ? 'none' : undefined,
  }

  return (
    <div
      ref={layer}
      className={cx('absolute z-[5] select-none', active ? 'pointer-events-auto' : 'pointer-events-none')}
      style={style}
      aria-hidden
      {...handlers}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none">
        {marks.strokes.map((s) => (
          <InkStroke key={s.key} stroke={s} />
        ))}
      </svg>
      {marks.lasers.map((l) => (
        <div
          key={l.who}
          className="pointer-events-none absolute transition-[left,top] duration-75 ease-linear"
          style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}
        >
          <span
            className="absolute -left-2 -top-2 h-4 w-4 rounded-full ring-2 ring-white/90"
            style={{ background: l.color, boxShadow: `0 0 14px 5px ${l.color}99` }}
          />
          <span
            className="absolute left-3 top-2 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-black shadow"
            style={{ background: l.color }}
          >
            {l.name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toolbar on the shared screen
// ---------------------------------------------------------------------------

export function AnnotateToolbar({ share, compact }: { share: string; compact: boolean }) {
  const room = useRoomContext()
  const [tool, setTool] = useTool(room)
  const sender = useSender(share)
  const pointBtn = useRef<HTMLButtonElement>(null)
  const drawBtn = useRef<HTMLButtonElement>(null)

  /** Put the tool away, keeping keyboard focus in the toolbar. */
  const done = useCallback(() => {
    const back = tool === 'draw' ? drawBtn.current : pointBtn.current
    setTool('none')
    back?.focus()
  }, [tool, setTool])

  // Esc puts the tool away (before anything else claims the key).
  useEffect(() => {
    if (tool === 'none') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || document.querySelector('[data-popover], dialog[open]')) return
      e.preventDefault()
      done()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [tool, done])

  // The share went away (or another took its place): put the tool away too.
  useEffect(() => () => setTool('none'), [share, setTool])

  const pick = (t: Tool): void => setTool(tool === t ? 'none' : t)
  const btn = (on: boolean): string =>
    cx(
      'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-[var(--room-accent-ring)] [@media(pointer:coarse)]:h-11',
      on ? 'bg-[var(--room-accent)] text-[var(--room-accent-fg)]' : 'text-ink hover:bg-white/[0.1]',
    )
  const label = compact ? 'sr-only' : 'hidden sm:inline'

  return (
    <div
      role="group"
      aria-label="Point and draw on the shared screen"
      // Centred, and never wide enough to reach the pin button in the corner.
      className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-1 overflow-hidden rounded-full border border-white/10 bg-[#0e0e16]/85 p-1 shadow-xl backdrop-blur-xl"
    >
      <button
        ref={pointBtn}
        type="button"
        aria-pressed={tool === 'point'}
        onClick={() => pick('point')}
        className={btn(tool === 'point')}
        title="Point (everyone sees where)"
      >
        <PointerIcon size={16} />
        <span className={label}>Point</span>
      </button>
      <button
        ref={drawBtn}
        type="button"
        aria-pressed={tool === 'draw'}
        onClick={() => pick('draw')}
        className={btn(tool === 'draw')}
        title="Draw (ink fades after a few seconds)"
      >
        <PenIcon size={16} />
        <span className={label}>Draw</span>
      </button>
      <button type="button" onClick={sender.clearMine} className={btn(false)} title="Clear my marks" aria-label="Clear my marks">
        <EraserIcon size={16} />
      </button>
      {tool !== 'none' && (
        <button type="button" onClick={done} className={btn(false)} aria-label="Stop pointing and drawing" title="Done (Esc)">
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Presenter's pop-out: a small always-on-top window with their shared screen
// and everyone's marks, so they see where people point while they work in the
// app they're sharing. Chrome and Edge (Document Picture-in-Picture).
// ---------------------------------------------------------------------------

interface DocumentPip {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
  window: Window | null
}

function documentPip(): DocumentPip | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture ?? null
}

/** Only one pop-out at a time, and the sync hook needs to know if it's open. */
let popOutOpen = false

/** Copy the page's styles into the pop-out so it looks the same. */
function copyStyles(target: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style')
      style.textContent = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n')
      target.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = target.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.head.appendChild(link)
      }
    }
  }
}

export function PresenterPopOut() {
  const room = useRoomContext()
  const store = annotationStore(room)
  const { brand, notify } = useCall()
  const { isScreenShareEnabled } = useLocalParticipant()
  const [pipBody, setPipBody] = useState<HTMLElement | null>(null)
  const pip = useRef<Window | null>(null)
  const supported = documentPip() !== null

  const open = useCallback(async () => {
    const api = documentPip()
    if (!api || pip.current) return
    try {
      const win = await api.requestWindow({ width: 520, height: 330 })
      pip.current = win
      popOutOpen = true
      copyStyles(win.document)
      win.document.title = 'Where people are pointing'
      win.document.body.style.margin = '0'
      win.document.body.style.background = '#08080c'
      win.addEventListener('pagehide', () => {
        pip.current = null
        popOutOpen = false
        setPipBody(null)
      })
      setPipBody(win.document.body)
    } catch (error) {
      console.error('[meeting] pop-out failed:', error)
      notify("Your browser couldn't open the pointer window. Switch back to this tab to see where people point.", 'warn')
    }
  }, [notify])

  // The toast ("Show me") opens it too.
  useEffect(() => {
    if (!supported) return
    store.openPopOut = () => void open()
    return () => {
      store.openPopOut = null
    }
  }, [store, open, supported])

  // Close it when the share stops (or the call ends).
  useEffect(() => {
    if (!isScreenShareEnabled) pip.current?.close()
  }, [isScreenShareEnabled])
  useEffect(() => () => pip.current?.close(), [])

  return (
    <>
      {supported && (
        <button
          type="button"
          onClick={() => void (pip.current ? pip.current.focus() : open())}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold transition hover:bg-white/15"
          title="A small window that stays on top, showing where people point on your screen"
        >
          <PopOutIcon size={14} /> {pipBody ? 'Showing pointers' : 'See pointers'}
        </button>
      )}
      {pipBody && createPortal(<PopOutView brandStyle={brandVars(brand.accent)} />, pipBody)}
    </>
  )
}

function PopOutView({ brandStyle }: { brandStyle: CSSProperties }) {
  const { localParticipant } = useLocalParticipant()
  const pub = localParticipant.getTrackPublication(Track.Source.ScreenShare)
  const own = ownShareInfo(pub?.track?.mediaStreamTrack)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [videoRatio, setVideoRatio] = useState<number | null>(null)
  const ratio = own.live ? videoRatio : own.ratio

  useEffect(() => {
    const el = box.current
    if (!el) return
    // The pop-out is its own window: observe with that window's ResizeObserver.
    const RO = (el.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver ?? ResizeObserver
    const ro = new RO((entries) => {
      const r = entries[0]?.contentRect
      if (r) setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rect = ratio && size.w > 0 && size.h > 0 ? containRect(size, ratio) : null
  const onVideoSize = (e: { currentTarget: HTMLVideoElement }): void => {
    const v = e.currentTarget
    if (v.videoWidth && v.videoHeight) setVideoRatio(v.videoWidth / v.videoHeight)
  }

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink" style={brandStyle}>
      <div ref={box} className="relative min-h-0 flex-1">
        {!pub?.track ? (
          <div className="grid h-full place-items-center text-sm text-muted">Your screen isn&apos;t being shared</div>
        ) : own.live ? (
          <VideoTrack
            trackRef={{ participant: localParticipant, source: Track.Source.ScreenShare, publication: pub }}
            onLoadedMetadata={onVideoSize}
            onResize={onVideoSize}
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          rect && <SharePlaceholder rect={rect} />
        )}
        {pub?.track && rect && (
          <AnnotationLayer share={localParticipant.identity} rect={rect} interactive={false} />
        )}
      </div>
    </div>
  )
}

/** Stands in for your own whole-screen share (see ownShareInfo): pointers land on it. */
export function SharePlaceholder({ rect }: { rect: { left: number; top: number; width: number; height: number } }) {
  return (
    <div
      className="absolute grid place-items-center rounded-lg border border-dashed border-white/20 bg-white/[0.03] p-3 text-center text-xs text-muted"
      style={rect}
    >
      Your screen is being shared. Pointers from others show here, in the same spot as on your screen.
    </div>
  )
}
