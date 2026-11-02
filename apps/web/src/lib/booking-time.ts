// Time-zone maths and slot generation for bookings. No imports: this runs on the
// server (to offer and re-check times), in the browser (to show them in the
// guest's zone), and under plain Node in tests.

/** One stretch of bookable time in a day, as 24h wall-clock "HH:MM" (end may be "24:00"). */
export interface HoursWindow {
  start: string
  end: string
}

/** Bookable hours per weekday: index 0 = Sunday … 6 = Saturday. */
export type WeeklyHours = HoursWindow[][]

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const DEFAULT_WEEKLY_HOURS: WeeklyHours = [
  [],
  [{ start: '09:00', end: '17:00' }],
  [{ start: '09:00', end: '17:00' }],
  [{ start: '09:00', end: '17:00' }],
  [{ start: '09:00', end: '17:00' }],
  [{ start: '09:00', end: '17:00' }],
  [],
]

const MINUTE = 60_000
const DAY_MINUTES = 24 * 60

/** "HH:MM" → minutes after midnight (null if malformed). "24:00" is allowed as an end. */
export function parseClock(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null
  return h * 60 + min
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * Tidy weekly hours from a form: drop malformed or empty windows, merge
 * overlapping ones, sort. Null if it isn't seven days of windows.
 */
export function normalizeWeeklyHours(input: unknown): WeeklyHours | null {
  if (!Array.isArray(input) || input.length !== 7) return null
  const out: WeeklyHours = []
  for (const day of input) {
    if (!Array.isArray(day) || day.length > 12) return null
    const spans: [number, number][] = []
    for (const w of day) {
      const start = parseClock(String((w as HoursWindow)?.start ?? ''))
      const end = parseClock(String((w as HoursWindow)?.end ?? ''))
      if (start === null || end === null || end <= start) continue
      spans.push([start, end])
    }
    spans.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const s of spans) {
      const last = merged[merged.length - 1]
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
      else merged.push([...s])
    }
    out.push(merged.map(([s, e]) => ({ start: formatClock(s), end: formatClock(e) })))
  }
  return out
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(timeZone, f)
  }
  return f
}

/** The wall-clock date and time an instant shows in a zone. */
export function zonedParts(
  instant: number,
  timeZone: string,
): { date: string; minutes: number; seconds: number } {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    seconds: Number(get('second')),
  }
}

/** The zone's offset from UTC at an instant, in ms (Sydney in summer: +11h). */
export function zoneOffsetMs(instant: number, timeZone: string): number {
  const { date, minutes, seconds } = zonedParts(instant, timeZone)
  const [y, m, d] = date.split('-').map(Number)
  const wallAsUtc = Date.UTC(y!, m! - 1, d!, 0, minutes, seconds)
  return wallAsUtc - Math.floor(instant / 1000) * 1000
}

/**
 * The instant a wall-clock time happens in a zone, or null if that time doesn't
 * exist there (skipped by a daylight-saving change). A repeated time (clocks
 * going back) resolves to its first occurrence.
 */
export function zonedTimeToUtc(date: string, minutes: number, timeZone: string): number | null {
  const [y, m, d] = date.split('-').map(Number)
  const wallAsUtc = Date.UTC(y!, m! - 1, d!, 0, minutes)
  // Try both offsets around the guess: the earlier valid one is the first occurrence.
  const candidates = new Set([
    wallAsUtc - zoneOffsetMs(wallAsUtc - 12 * 60 * MINUTE, timeZone),
    wallAsUtc - zoneOffsetMs(wallAsUtc + 12 * 60 * MINUTE, timeZone),
  ])
  let best: number | null = null
  for (const t of candidates) {
    const p = zonedParts(t, timeZone)
    if (p.date === date && p.minutes === minutes % DAY_MINUTES && (best === null || t < best)) best = t
  }
  // "24:00" is midnight of the next day.
  if (best === null && minutes === DAY_MINUTES) return zonedTimeToUtc(addDays(date, 1), 0, timeZone)
  return best
}

/** "YYYY-MM-DD" plus n days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

/** Day of the week of a "YYYY-MM-DD" date (0 = Sunday). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

export interface SlotRules {
  durationMinutes: number
  slotStepMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  maxDaysAhead: number
  timeZone: string
  weeklyHours: WeeklyHours
}

/** A time the host can't be booked (another booking, time off). Epoch ms, end exclusive. */
export interface BusyInterval {
  start: number
  end: number
}

/** The furthest-ahead instant bookable: the end of the last allowed day, in the host's zone. */
export function bookingHorizon(rules: SlotRules, now: number): number {
  const today = zonedParts(now, rules.timeZone).date
  const lastDay = addDays(today, rules.maxDaysAhead)
  return zonedTimeToUtc(addDays(lastDay, 1), 0, rules.timeZone) ?? now + (rules.maxDaysAhead + 1) * DAY_MINUTES * MINUTE
}

/**
 * Start times (epoch ms, ascending) a guest can book between `from` and `to`:
 * inside the weekly hours, after the minimum notice, within the horizon, and
 * clear of busy time (with this event's buffers either side).
 */
export function availableSlots(
  rules: SlotRules,
  busy: BusyInterval[],
  from: number,
  to: number,
  now: number,
): number[] {
  const start = Math.max(from, now + rules.minNoticeMinutes * MINUTE)
  const end = Math.min(to, bookingHorizon(rules, now))
  if (start >= end) return []
  const duration = rules.durationMinutes * MINUTE
  const before = rules.bufferBeforeMinutes * MINUTE
  const after = rules.bufferAfterMinutes * MINUTE
  const step = Math.max(5, rules.slotStepMinutes)
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start)

  const out: number[] = []
  // A day's hours can spill either side of the UTC range, so walk one extra day each way.
  const lastDate = addDays(zonedParts(end, rules.timeZone).date, 1)
  for (let date = addDays(zonedParts(start, rules.timeZone).date, -1); date <= lastDate; date = addDays(date, 1)) {
    for (const w of rules.weeklyHours[weekdayOf(date)] ?? []) {
      const open = parseClock(w.start)
      const close = parseClock(w.end)
      if (open === null || close === null) continue
      for (let m = open; m + rules.durationMinutes <= close; m += step) {
        const t = zonedTimeToUtc(date, m, rules.timeZone)
        if (t === null || t < start || t >= end) continue
        const blockStart = t - before
        const blockEnd = t + duration + after
        const clash = sortedBusy.some((b) => b.start < blockEnd && b.end > blockStart)
        if (!clash) out.push(t)
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/** Whether one exact start time is bookable right now. */
export function isSlotAvailable(
  rules: SlotRules,
  busy: BusyInterval[],
  startsAt: number,
  now: number,
): boolean {
  return availableSlots(rules, busy, startsAt, startsAt + 1, now).includes(startsAt)
}

/** "Tue 4 Nov 2026, 10:00 am" style label in a zone. */
export function formatWhen(instant: number, timeZone: string, withZone = false): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' } : {}),
  }).format(new Date(instant))
}

/** "Tue, 4 Nov 2026" in a zone. */
export function formatDay(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(instant))
}

/** "10:00 am" in a zone. */
export function formatTime(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(instant),
  )
}

/** "1 hr 30 min" style duration label. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} hr ${m} min` : `${h} hr`
}
