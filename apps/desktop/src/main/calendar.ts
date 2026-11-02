import { Notification, shell } from 'electron'
import type { BookingsStatus, RoomsResult, UpcomingBooking } from '../shared/ipc'
import { API_BASE_URL } from './config'
import { loadToken } from './token-store'

const REFRESH_MS = 5 * 60 * 1000
const HEADS_UP_MS = 5 * 60 * 1000
// Only arm heads-up timers this far ahead; later calls are armed on a later refresh.
const ARM_WINDOW_MS = 12 * 60 * 60 * 1000

async function getJson<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const token = loadToken()
  if (!token) return { ok: false, status: 401 }
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, status: 0 }
  }
}

/** The user's meeting rooms in every business. Null if signed out or unreachable. */
export async function fetchRooms(): Promise<RoomsResult | null> {
  const res = await getJson<RoomsResult>('/api/desktop/rooms')
  return res.ok ? res.data : null
}

function openUrl(url: string | null): void {
  if (!url) return
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
  } catch {
    // ignore malformed url
  }
}

/** "Today 2:30 pm", "Tomorrow 9:00 am" or "Thu 6 Nov, 9:00 am", in the computer's time zone. */
export function callTimeLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  const day = (t: number): string => new Date(t).toDateString()
  if (day(d.getTime()) === day(now)) return `Today ${time}`
  if (day(d.getTime()) === day(now + 86_400_000)) return `Tomorrow ${time}`
  return `${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

/**
 * Keeps the user's upcoming bookings fresh (every 5 minutes while signed in),
 * raises a notification 5 minutes before each call they host, and tells the
 * tray/renderer when anything changes.
 */
export function createCalendar(onChange: (status: BookingsStatus) => void) {
  let status: BookingsStatus = {
    bookings: null,
    manageUrl: null,
    signedIn: Boolean(loadToken()),
    loading: false,
    error: null,
    updatedAt: null,
  }
  let interval: NodeJS.Timeout | null = null
  let rollover: NodeJS.Timeout | null = null
  const timers = new Map<string, NodeJS.Timeout>()
  // Calls already announced (keyed by id + start, so a moved call is announced again).
  const announced = new Set<string>()

  const set = (next: Partial<BookingsStatus>): void => {
    status = { ...status, ...next }
    onChange(status)
  }

  const headsUp = (b: UpcomingBooking): void => {
    const key = `${b.id}@${b.startsAt}`
    if (announced.has(key)) return
    announced.add(key)
    if (!Notification.isSupported()) return
    const minutes = Math.max(1, Math.round((new Date(b.startsAt).getTime() - Date.now()) / 60_000))
    const note = new Notification({
      title: `Call in ${minutes} minute${minutes === 1 ? '' : 's'}`,
      body: `${b.title} with ${b.guestName} (${b.businessName}). Click to join.`,
    })
    note.on('click', () => openUrl(b.joinUrl))
    note.show()
  }

  const arm = (bookings: UpcomingBooking[]): void => {
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    const now = Date.now()
    for (const b of bookings) {
      if (!b.isMine) continue
      const start = new Date(b.startsAt).getTime()
      const at = start - HEADS_UP_MS
      if (start <= now - 60_000 || at > now + ARM_WINDOW_MS) continue
      // Inside the 5 minutes already (just booked, or the app just opened): say so now.
      if (at <= now) headsUp(b)
      else
        timers.set(
          b.id,
          setTimeout(() => headsUp(b), at - now),
        )
    }
    // When the next call ends, refresh so the tray moves on to the one after.
    if (rollover) clearTimeout(rollover)
    const next = bookings.find((b) => b.isMine && new Date(b.endsAt).getTime() > now)
    if (next) {
      const ms = new Date(next.endsAt).getTime() - now + 1000
      if (ms < REFRESH_MS) rollover = setTimeout(() => void refresh(), ms)
    }
  }

  async function refresh(): Promise<BookingsStatus> {
    if (!loadToken()) {
      arm([])
      set({ bookings: null, manageUrl: null, signedIn: false, loading: false, error: null })
      return status
    }
    set({ signedIn: true, loading: true })
    const res = await getJson<{ bookings: UpcomingBooking[]; manageUrl: string }>(
      '/api/desktop/bookings',
    )
    if (res.ok) {
      arm(res.data.bookings)
      set({
        bookings: res.data.bookings,
        manageUrl: res.data.manageUrl,
        loading: false,
        error: null,
        updatedAt: Date.now(),
      })
    } else {
      set({
        loading: false,
        error:
          res.status === 401
            ? 'Sign in again to see your bookings.'
            : res.status === 403
              ? 'Your account is waiting for approval.'
              : 'Couldn’t reach Let Me Show You. Check your connection.',
      })
    }
    return status
  }

  return {
    getStatus: (): BookingsStatus => status,
    refresh,
    /** The next call the user hosts that hasn't ended. */
    nextCall: (): UpcomingBooking | null =>
      status.bookings?.find((b) => b.isMine && new Date(b.endsAt).getTime() > Date.now()) ?? null,
    join: (b: UpcomingBooking): void => openUrl(b.joinUrl),
    start: (): void => {
      void refresh()
      if (!interval) interval = setInterval(() => void refresh(), REFRESH_MS)
    },
    stop: (): void => {
      if (interval) clearInterval(interval)
      if (rollover) clearTimeout(rollover)
      for (const t of timers.values()) clearTimeout(t)
      interval = null
    },
  }
}

export type Calendar = ReturnType<typeof createCalendar>
