import { useEffect, useMemo, useState } from 'react'
import type { BookingsStatus, UpcomingBooking } from '@shared/ipc'
import { SignedOutNote } from './SignedOutNote'

const SOON_MS = 10 * 60 * 1000

function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

function dayLabel(iso: string, now: number): string {
  const key = dayKey(iso)
  if (key === new Date(now).toDateString()) return 'Today'
  if (key === new Date(now + 86_400_000).toDateString()) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

/** Calls the user hosts today (for the Calendar tab's badge). */
export function callsToday(status: BookingsStatus | null, now = Date.now()): number {
  const today = new Date(now).toDateString()
  return (status?.bookings ?? []).filter(
    (b) => b.isMine && dayKey(b.startsAt) === today && new Date(b.endsAt).getTime() > now,
  ).length
}

function BookingCard({ b, now }: { b: UpcomingBooking; now: number }) {
  const start = new Date(b.startsAt).getTime()
  const live = start <= now
  const soon = !live && start - now <= SOON_MS
  const extras = [...(b.notes ? [{ label: 'Notes', value: b.notes }] : []), ...b.answers]
  return (
    <article
      className={`booking-card ${b.isMine ? '' : 'not-mine'}`}
      data-soon={live || soon ? '' : undefined}
    >
      <div className="booking-time">
        <span className="booking-start">{time(b.startsAt)}</span>
        <span className="booking-end">{time(b.endsAt)}</span>
      </div>
      <div className="booking-main">
        <span className="booking-title">
          {b.title} with {b.guestName}
        </span>
        <span className="booking-meta">
          {b.businessName}
          {!b.isMine && b.hostName ? `, hosted by ${b.hostName}` : ''}
          {live
            ? ', happening now'
            : soon
              ? `, in ${Math.max(1, Math.round((start - now) / 60_000))} min`
              : ''}
        </span>
        {extras.length > 0 && (
          <details className="booking-answers">
            <summary className="no-drag">Their answers</summary>
            <dl>
              {extras.map((a) => (
                <div key={a.label}>
                  <dt>{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
      {b.joinUrl && (
        <button
          className={`${live || soon ? 'btn-go' : 'btn-mini'} booking-join no-drag`}
          onClick={() => void window.recorder.openExternalUrl(b.joinUrl as string)}
        >
          {live || soon ? 'Join now' : 'Join'}
        </button>
      )}
    </article>
  )
}

/** Upcoming bookings across the user's businesses, grouped by day. */
export function CalendarPanel({ status }: { status: BookingsStatus | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    void window.recorder.refreshBookings()
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const days = useMemo(() => {
    const out: { key: string; label: string; items: UpcomingBooking[] }[] = []
    for (const b of status?.bookings ?? []) {
      if (new Date(b.endsAt).getTime() <= now) continue
      const key = dayKey(b.startsAt)
      let g = out.find((d) => d.key === key)
      if (!g) {
        g = { key, label: dayLabel(b.startsAt, now), items: [] }
        out.push(g)
      }
      g.items.push(b)
    }
    return out
  }, [status, now])

  if (status && !status.signedIn) return <SignedOutNote what="bookings" />
  if (!status || (status.bookings === null && !status.error)) {
    return <div className="picker-empty">Loading your bookings…</div>
  }
  if (status.bookings === null && status.error) {
    return (
      <div className="side-empty">
        <p className="side-empty-title">Couldn’t load your bookings</p>
        <p className="side-empty-body">{status.error}</p>
        <button
          className="btn-secondary no-drag"
          onClick={() => void window.recorder.refreshBookings()}
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="side-list">
      {days.length === 0 ? (
        <div className="side-empty">
          <p className="side-empty-title">No calls booked in the next 30 days</p>
          <p className="side-empty-body">
            When a client books a time, it shows up here, and you get a heads-up 5 minutes before.
          </p>
        </div>
      ) : (
        days.map((d) => (
          <section key={d.key} className="side-group">
            <h3 className="group-title">{d.label}</h3>
            {d.items.map((b) => (
              <BookingCard key={b.id} b={b} now={now} />
            ))}
          </section>
        ))
      )}
      {status.error && <p className="signin-error">{status.error}</p>}
      {status.manageUrl && (
        <button
          className="side-link no-drag"
          onClick={() => void window.recorder.openExternalUrl(status.manageUrl as string)}
        >
          Change your calendars and hours on the website
        </button>
      )}
    </div>
  )
}
