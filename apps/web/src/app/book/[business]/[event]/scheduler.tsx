'use client'

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  addDays,
  formatDuration,
  formatTime,
  formatWhen,
  weekdayOf,
  zonedParts,
  zonedTimeToUtc,
} from '@/lib/booking-time'
import { bookSlot, getSlots } from '../../actions'

interface Props {
  businessSlug: string
  eventSlug: string
  title: string
  description: string | null
  durationMinutes: number
  hostName: string
  hostTimeZone: string
  firstSlot: string | null
  accent: string
  reschedule: { token: string; name: string; email: string; startsAt: string } | null
}

const inputCls =
  'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none'
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthOf(date: string): string {
  return date.slice(0, 7)
}

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y!, m! - 1, 1)),
  )
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y!, m! - 1, d!)))
}

function allTimeZones(current: string[]): string[] {
  let zones: string[] = []
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    zones = []
  }
  return [...new Set([...current, ...zones])].sort()
}

export function Scheduler(props: Props) {
  const router = useRouter()
  const [tz, setTz] = useState(props.hostTimeZone)
  const [month, setMonth] = useState(() =>
    monthOf(zonedParts(props.firstSlot ? Date.parse(props.firstSlot) : Date.now(), props.hostTimeZone).date),
  )
  const [byDay, setByDay] = useState<Map<string, number[]> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [name, setName] = useState(props.reschedule?.name ?? '')
  const [email, setEmail] = useState(props.reschedule?.email ?? '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [pending, startTransition] = useTransition()

  // Show times in the guest's own zone once we know it.
  useEffect(() => {
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (mine && mine !== props.hostTimeZone) {
      setTz(mine)
      setMonth(monthOf(zonedParts(props.firstSlot ? Date.parse(props.firstSlot) : Date.now(), mine).date))
    }
  }, [props.hostTimeZone, props.firstSlot])

  const zones = useMemo(() => allTimeZones([tz, props.hostTimeZone]), [tz, props.hostTimeZone])
  const today = zonedParts(Date.now(), tz).date
  const thisMonth = monthOf(today)

  // Load the month's open times (in the guest's zone).
  useEffect(() => {
    let cancelled = false
    setByDay(null)
    setLoadError(null)
    const first = `${month}-01`
    const from = zonedTimeToUtc(first, 0, tz) ?? Date.parse(`${first}T00:00:00Z`)
    const nextFirst = `${shiftMonth(month, 1)}-01`
    const to = zonedTimeToUtc(nextFirst, 0, tz) ?? Date.parse(`${nextFirst}T00:00:00Z`)
    getSlots(
      props.businessSlug,
      props.eventSlug,
      new Date(from).toISOString(),
      new Date(to).toISOString(),
      props.reschedule?.token,
    )
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setLoadError(res.error)
          return
        }
        const map = new Map<string, number[]>()
        for (const iso of res.slots) {
          const t = Date.parse(iso)
          const day = zonedParts(t, tz).date
          map.set(day, [...(map.get(day) ?? []), t])
        }
        setByDay(map)
      })
      .catch(() => !cancelled && setLoadError('Could not load times. Please refresh.'))
    return () => {
      cancelled = true
    }
  }, [month, tz, reloadKey, props.businessSlug, props.eventSlug, props.reschedule?.token])

  // Keep the selected day valid as the month/zone changes: default to the first open day.
  useEffect(() => {
    if (!byDay) return
    if (selectedDay && byDay.has(selectedDay)) return
    const firstOpen = [...byDay.keys()].sort()[0] ?? null
    setSelectedDay(firstOpen)
  }, [byDay, selectedDay])

  const cells = useMemo(() => {
    const first = `${month}-01`
    const lead = (weekdayOf(first) + 6) % 7 // Monday-first grid
    const out: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let d = first; monthOf(d) === month; d = addDays(d, 1)) out.push(d)
    while (out.length % 7) out.push(null)
    return out
  }, [month])

  const times = selectedDay ? byDay?.get(selectedDay) ?? [] : []
  const style = { '--bk-accent': props.accent } as CSSProperties

  function confirm(): void {
    if (slot === null || pending) return
    setError(null)
    startTransition(async () => {
      const res = await bookSlot(props.businessSlug, props.eventSlug, {
        startsAt: new Date(slot).toISOString(),
        name,
        email,
        notes,
        timeZone: tz,
        rescheduleToken: props.reschedule?.token,
      }).catch(() => ({ ok: false as const, error: 'Something went wrong. Please try again.' }))
      if (res.ok) {
        router.push(`/booking/${res.token}`)
        return
      }
      setError(res.error)
      if ('taken' in res && res.taken) {
        setSlot(null)
        setReloadKey((k) => k + 1)
      }
    })
  }

  return (
    <div className="glass rise grid overflow-hidden rounded-2xl md:grid-cols-[17rem_1fr]" style={style}>
      <aside className="flex flex-col gap-3 border-b border-line p-5 md:border-b-0 md:border-r">
        <p className="text-sm text-muted">{props.hostName}</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{props.title}</h1>
        <p className="flex items-center gap-2 text-sm text-muted">
          <ClockIcon /> {formatDuration(props.durationMinutes)}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted">
          <VideoIcon /> Video call in your browser
        </p>
        {props.reschedule && (
          <p className="rounded-lg border border-line bg-white/[0.03] p-3 text-sm text-muted">
            Moving your booking from{' '}
            <span className="text-ink">{formatWhen(Date.parse(props.reschedule.startsAt), tz)}</span>
          </p>
        )}
        {props.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-faint">{props.description}</p>
        )}
      </aside>

      {slot === null ? (
        <section className="flex flex-col gap-5 p-5 lg:flex-row">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{monthLabel(month)}</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  className="btn-ghost h-9 w-9 disabled:opacity-30"
                  disabled={month <= thisMonth}
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  className="btn-ghost h-9 w-9"
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                >
                  ›
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-faint">
              {WEEK.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={`x${i}`} />
                const open = Boolean(byDay?.get(d)?.length)
                const selected = d === selectedDay
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!open}
                    onClick={() => setSelectedDay(d)}
                    aria-pressed={selected}
                    aria-label={`${dayLabel(d)}${open ? '' : ', no times'}`}
                    className={`relative grid aspect-square place-items-center rounded-full text-sm transition ${
                      selected
                        ? 'bg-[var(--bk-accent)] font-semibold text-white'
                        : open
                          ? 'bg-white/[0.06] font-semibold text-ink hover:bg-white/[0.12]'
                          : 'text-faint/60'
                    }`}
                  >
                    {Number(d.slice(8))}
                    {d === today && !selected && (
                      <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[var(--bk-accent)]" />
                    )}
                  </button>
                )
              })}
            </div>
            <label className="mt-4 flex flex-col gap-1 text-xs text-faint">
              Time zone
              <select
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className={`${inputCls} py-2 text-sm`}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="lg:w-52">
            {loadError ? (
              <p className="text-sm text-red-300">{loadError}</p>
            ) : !byDay ? (
              <p className="text-sm text-muted">Loading times…</p>
            ) : byDay.size === 0 ? (
              <div className="text-sm text-muted">
                <p>No times left in {monthLabel(month)}.</p>
                <button
                  type="button"
                  className="mt-2 underline hover:text-ink"
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                >
                  Try next month
                </button>
              </div>
            ) : selectedDay ? (
              <>
                <h3 className="mb-3 text-sm font-semibold text-ink">{dayLabel(selectedDay)}</h3>
                <ul className="flex max-h-[22rem] flex-col gap-2 overflow-y-auto pr-1">
                  {times.map((t) => (
                    <li key={t}>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          setSlot(t)
                        }}
                        className="w-full rounded-lg border border-[var(--bk-accent)]/50 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-[var(--bk-accent)] hover:text-white"
                      >
                        {formatTime(t, tz)}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4 p-5">
          <button
            type="button"
            className="self-start text-sm text-faint transition hover:text-ink"
            onClick={() => setSlot(null)}
          >
            ← Pick another time
          </button>
          <div className="rounded-xl border border-line bg-white/[0.03] p-4">
            <p className="font-semibold text-ink">{formatWhen(slot, tz)}</p>
            <p className="text-sm text-muted">
              {formatDuration(props.durationMinutes)} · {tz.replace(/_/g, ' ')}
            </p>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              confirm()
            }}
          >
            <label className="flex flex-col gap-1 text-sm text-muted">
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                autoComplete="name"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoComplete="email"
                readOnly={Boolean(props.reschedule)}
                className={`${inputCls} read-only:opacity-70`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              <span>
                Anything to share before the call? <span className="text-faint">(optional)</span>
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={3}
                className={inputCls}
              />
            </label>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="mt-1 rounded-lg px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              style={{ background: props.accent }}
            >
              {pending ? 'Booking…' : props.reschedule ? 'Move my booking' : 'Confirm booking'}
            </button>
            <p className="text-xs text-faint">
              You&rsquo;ll get a confirmation email with the meeting link and a calendar invite.
            </p>
          </form>
        </section>
      )}
    </div>
  )
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" strokeLinejoin="round" />
    </svg>
  )
}
