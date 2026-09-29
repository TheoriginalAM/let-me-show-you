'use client'

import { useCallback, useSyncExternalStore } from 'react'
import type { Room } from 'livekit-client'

// ---------------------------------------------------------------------------
// Pointing and drawing on a shared screen.
//
// Everything is in coordinates of the shared picture itself (0..1 across and
// down), so marks land in the same spot on every screen, whatever its size.
// Ink fades on its own after a few seconds: shared screens scroll, so marks
// that stayed would soon point at the wrong thing (and late joiners never need
// a history). Messages go over the LiveKit data channel on topic 'annotate';
// LiveKit stamps who sent each one, so the payload never says who it's from.
// ---------------------------------------------------------------------------

export const ANNOTATE_TOPIC = 'annotate'

export type Tool = 'none' | 'point' | 'draw'
export type Pt = [number, number]

export interface Stroke {
  key: string // `${who}:${id}`
  who: string
  color: string
  pts: Pt[]
  /** When the pen lifted (ms); the stroke fades out after that. */
  endedAt: number | null
  /** When points last arrived: a stroke nobody finishes is ended after a pause. */
  lastAt: number
}

export interface Laser {
  who: string
  name: string
  color: string
  x: number
  y: number
  at: number
}

export interface ShareMarks {
  strokes: Stroke[]
  lasers: Laser[]
}

/** How long ink stays after the pen lifts, then how long it takes to fade. */
export const INK_HOLD_MS = 4000
export const INK_FADE_MS = 1000
/** A pointer that stops moving disappears after this. */
const LASER_IDLE_MS = 2500
/**
 * A stroke that gets no points for this long counts as finished (and fades),
 * so a lost "pen up" (or someone never sending one) can't leave ink for good.
 */
const STROKE_IDLE_MS = 3000

const MAX_STROKES_PER_PERSON = 40
/** Senders start a new stroke before this, so a long gesture keeps drawing. */
export const MAX_POINTS_PER_STROKE = 600
const MAX_OPEN_STROKES_PER_PERSON = 2
const MAX_POINTS_PER_MESSAGE = 64

// Bright, distinct on most screen content (white pages and dark apps alike).
const COLORS = ['#ff3d71', '#ffb020', '#22d3ee', '#a3e635', '#c084fc', '#fb923c', '#38bdf8', '#f472b6']

/** A person's annotation colour: the same for everyone, from their identity. */
export function colorFor(identity: string): string {
  let h = 0
  for (let i = 0; i < identity.length; i++) h = (h * 31 + identity.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

// ---------------------------------------------------------------------------
// Store (one per room). useSyncExternalStore keeps re-renders to the overlay
// of the share that changed, not the whole call.
// ---------------------------------------------------------------------------

const EMPTY: ShareMarks = { strokes: [], lasers: [] }

class AnnotationStore {
  private shares = new Map<string, ShareMarks>()
  private listeners = new Map<string, Set<() => void>>()
  private toolListeners = new Set<() => void>()
  private sweep: ReturnType<typeof setInterval> | null = null
  tool: Tool = 'none'

  get(share: string): ShareMarks {
    return this.shares.get(share) ?? EMPTY
  }

  subscribe(share: string, fn: () => void): () => void {
    let set = this.listeners.get(share)
    if (!set) this.listeners.set(share, (set = new Set()))
    set.add(fn)
    return () => {
      set.delete(fn)
      if (!set.size) this.listeners.delete(share)
    }
  }

  subscribeTool(fn: () => void): () => void {
    this.toolListeners.add(fn)
    return () => {
      this.toolListeners.delete(fn)
    }
  }

  setTool(tool: Tool): void {
    if (tool === this.tool) return
    this.tool = tool
    this.toolListeners.forEach((fn) => fn())
  }

  private update(share: string, next: ShareMarks): void {
    // Empty shares aren't kept (their key may have been anyone's identity).
    if (!next.strokes.length && !next.lasers.length) this.shares.delete(share)
    else this.shares.set(share, next)
    this.listeners.get(share)?.forEach((fn) => fn())
    if (this.shares.size) this.ensureSweep()
  }

  laser(share: string, l: Omit<Laser, 'at'>): void {
    const cur = this.get(share)
    const at = Date.now()
    const lasers = [...cur.lasers.filter((x) => x.who !== l.who), { ...l, at }]
    this.update(share, { ...cur, lasers })
  }

  laserEnd(share: string, who: string): void {
    const cur = this.get(share)
    if (!cur.lasers.some((l) => l.who === who)) return
    this.update(share, { ...cur, lasers: cur.lasers.filter((l) => l.who !== who) })
  }

  /** Add points to a stroke (creating it), optionally lifting the pen. */
  stroke(share: string, who: string, id: string, color: string, pts: Pt[], done: boolean): void {
    const cur = this.get(share)
    const key = `${who}:${id}`
    const existing = cur.strokes.find((s) => s.key === key)
    if (existing?.endedAt) return // already finished: ignore stragglers
    const now = Date.now()
    const merged: Stroke = existing
      ? {
          ...existing,
          pts: existing.pts.concat(pts).slice(0, MAX_POINTS_PER_STROKE),
          endedAt: done ? now : null,
          lastAt: now,
        }
      : { key, who, color, pts: pts.slice(0, MAX_POINTS_PER_STROKE), endedAt: done ? now : null, lastAt: now }
    let strokes = existing ? cur.strokes.map((s) => (s.key === key ? merged : s)) : [...cur.strokes, merged]
    // One person can only have a couple of strokes in progress: older ones end.
    const open = strokes.filter((s) => s.who === who && s.endedAt === null)
    if (open.length > MAX_OPEN_STROKES_PER_PERSON) {
      const end = new Set(open.slice(0, open.length - MAX_OPEN_STROKES_PER_PERSON).map((s) => s.key))
      strokes = strokes.map((s) => (end.has(s.key) ? { ...s, endedAt: now } : s))
    }
    // Cap each person's strokes (oldest go first).
    const mine = strokes.filter((s) => s.who === who)
    if (mine.length > MAX_STROKES_PER_PERSON) {
      const drop = new Set(mine.slice(0, mine.length - MAX_STROKES_PER_PERSON).map((s) => s.key))
      strokes = strokes.filter((s) => !drop.has(s.key))
    }
    this.update(share, { ...cur, strokes })
  }

  clear(share: string, who: string): void {
    const cur = this.get(share)
    this.update(share, {
      strokes: cur.strokes.filter((s) => s.who !== who),
      lasers: cur.lasers.filter((l) => l.who !== who),
    })
  }

  /** A share ended: its marks go with it. */
  clearShare(share: string): void {
    if (this.shares.has(share)) this.update(share, EMPTY)
  }

  /** Opens the presenter's pop-out window (registered by the presenting bar). */
  openPopOut: (() => void) | null = null

  /** Someone left: forget their marks. */
  forget(who: string): void {
    for (const [share, cur] of this.shares) {
      if (share === who) {
        this.update(share, EMPTY)
        continue
      }
      if (cur.strokes.some((s) => s.who === who) || cur.lasers.some((l) => l.who === who)) {
        this.update(share, {
          strokes: cur.strokes.filter((s) => s.who !== who),
          lasers: cur.lasers.filter((l) => l.who !== who),
        })
      }
    }
  }

  /** Drop faded ink and idle pointers; stops itself when nothing is left. */
  private ensureSweep(): void {
    if (this.sweep) return
    this.sweep = setInterval(() => {
      const now = Date.now()
      let anything = false
      for (const [share, cur] of this.shares) {
        let changed = false
        const strokes = cur.strokes
          .map((s) => {
            if (s.endedAt !== null || now - s.lastAt < STROKE_IDLE_MS) return s
            changed = true
            return { ...s, endedAt: now } // abandoned mid-stroke: let it fade
          })
          .filter((s) => s.endedAt === null || now - s.endedAt < INK_HOLD_MS + INK_FADE_MS + 200)
        const lasers = cur.lasers.filter((l) => now - l.at < LASER_IDLE_MS)
        if (changed || strokes.length !== cur.strokes.length || lasers.length !== cur.lasers.length) {
          this.update(share, { strokes, lasers })
        }
        if (strokes.length || lasers.length) anything = true
      }
      if (!anything && this.sweep) {
        clearInterval(this.sweep)
        this.sweep = null
      }
    }, 400)
  }
}

const stores = new WeakMap<Room, AnnotationStore>()

export function annotationStore(room: Room): AnnotationStore {
  let s = stores.get(room)
  if (!s) stores.set(room, (s = new AnnotationStore()))
  return s
}

export function useShareMarks(room: Room, share: string): ShareMarks {
  const store = annotationStore(room)
  const subscribe = useCallback((fn: () => void) => store.subscribe(share, fn), [store, share])
  return useSyncExternalStore(
    subscribe,
    () => store.get(share),
    () => EMPTY,
  )
}

export function useTool(room: Room): [Tool, (t: Tool) => void] {
  const store = annotationStore(room)
  const tool = useSyncExternalStore(
    useCallback((fn: () => void) => store.subscribeTool(fn), [store]),
    () => store.tool,
    () => 'none' as Tool,
  )
  return [tool, useCallback((t: Tool) => store.setTool(t), [store])]
}

// ---------------------------------------------------------------------------
// Wire format. Short keys: pointer moves are sent many times a second.
//   { k: 'p', s, x, y }            pointer at (x, y)        (lossy)
//   { k: 'pe', s }                 pointer gone             (reliable)
//   { k: 's', s, i, p: [[x,y]..], d }  stroke points, d = pen lifted (reliable)
//   { k: 'c', s }                  clear my marks           (reliable)
// `s` is the identity of the person whose screen share it's drawn on.
// ---------------------------------------------------------------------------

export type AnnotateMessage =
  | { k: 'p'; s: string; x: number; y: number }
  | { k: 'pe'; s: string }
  | { k: 's'; s: string; i: string; p: Pt[]; d: boolean }
  | { k: 'c'; s: string }

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/
const unit = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null

/** Parse a packet from another browser; anything malformed is dropped. */
export function decodeAnnotate(payload: Uint8Array): AnnotateMessage | null {
  let m: Record<string, unknown>
  try {
    m = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>
  } catch {
    return null
  }
  if (!m || typeof m !== 'object' || typeof m.s !== 'string' || !ID_RE.test(m.s)) return null
  const s = m.s
  switch (m.k) {
    case 'p': {
      const x = unit(m.x)
      const y = unit(m.y)
      return x === null || y === null ? null : { k: 'p', s, x, y }
    }
    case 'pe':
      return { k: 'pe', s }
    case 'c':
      return { k: 'c', s }
    case 's': {
      if (typeof m.i !== 'string' || !/^[a-z0-9]{1,16}$/.test(m.i) || !Array.isArray(m.p)) return null
      const p: Pt[] = []
      for (const pt of m.p.slice(0, MAX_POINTS_PER_MESSAGE)) {
        if (!Array.isArray(pt)) return null
        const x = unit(pt[0])
        const y = unit(pt[1])
        if (x === null || y === null) return null
        p.push([x, y])
      }
      return { k: 's', s, i: m.i, p, d: m.d === true }
    }
    default:
      return null
  }
}

export function encodeAnnotate(m: AnnotateMessage): Uint8Array<ArrayBuffer> {
  // Three decimals is well under a pixel on any screen, and keeps packets small.
  const round = (n: number): number => Math.round(n * 1000) / 1000
  const body =
    m.k === 'p'
      ? { ...m, x: round(m.x), y: round(m.y) }
      : m.k === 's'
        ? { ...m, p: m.p.map(([x, y]) => [round(x), round(y)]) }
        : m
  return new TextEncoder().encode(JSON.stringify(body))
}

export { MAX_POINTS_PER_MESSAGE }
