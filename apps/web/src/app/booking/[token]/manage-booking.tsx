'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BookingAnswer } from '@/lib/booking-questions'
import { formatDuration, formatTime, formatWhen } from '@/lib/booking-time'
import { cancelByGuest } from '../../book/actions'

interface Props {
  token: string
  businessName: string
  hostPhoto: string | null
  message: string | null
  answers: BookingAnswer[]
  title: string
  hostName: string | null
  guestName: string
  guestEmail: string
  startsAt: number
  endsAt: number
  savedTimeZone: string
  status: 'confirmed' | 'cancelled'
  rescheduled: boolean
  joinUrl: string | null
  googleUrl: string
  rescheduleUrl: string | null
  rebookUrl: string | null
}

export function ManageBooking(p: Props) {
  const router = useRouter()
  const [tz, setTz] = useState(p.savedTimeZone)
  const [now, setNow] = useState(() => Date.now())
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || p.savedTimeZone)
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [p.savedTimeZone])

  const confirmed = p.status === 'confirmed'
  const over = p.endsAt <= now
  const startsSoon = p.startsAt - now < 15 * 60_000

  function cancel(): void {
    setError(null)
    startTransition(async () => {
      const res = await cancelByGuest(p.token, reason).catch(() => ({
        ok: false as const,
        error: 'Try again.',
      }))
      if (res.ok) router.refresh()
      else setError(res.error)
    })
  }

  return (
    <div className="card flex flex-col gap-5 rounded-3xl p-6 sm:p-8">
      <div>
        <p
          className={`flex items-center gap-2 text-sm font-bold ${confirmed && !over ? 'text-accent-ink' : 'text-muted'}`}
        >
          {confirmed && !over && (
            <span
              className="grid h-6 w-6 place-items-center rounded-full bg-accent text-on-accent"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
          )}
          {!confirmed
            ? p.rescheduled
              ? 'This booking was moved'
              : 'Cancelled'
            : over
              ? 'This call has finished'
              : 'You’re booked'}
        </p>
        <h1 className="mt-2 font-brand text-[2rem] font-bold leading-tight tracking-tight text-ink">
          {p.title}
        </h1>
        <p className="mt-1 text-muted">
          with {p.hostName && p.hostName !== p.businessName ? `${p.hostName}, ` : ''}
          {p.businessName}
        </p>
      </div>

      {confirmed && !over && p.message && (
        <div className="flex items-start gap-3 rounded-2xl bg-accent/10 p-4">
          {p.hostPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.hostPhoto}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          )}
          <p className="whitespace-pre-line leading-relaxed text-ink">{p.message}</p>
        </div>
      )}

      <dl className="grid gap-2 rounded-2xl border border-line bg-surface-2 p-4 text-sm">
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-faint">When</dt>
          <dd className={`text-ink ${confirmed ? '' : 'line-through decoration-1'}`}>
            {formatWhen(p.startsAt, tz)} to {formatTime(p.endsAt, tz)}
            <span className="block text-xs text-faint">{tz.replace(/_/g, ' ')}</span>
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-faint">Length</dt>
          <dd className="text-ink">
            {formatDuration(Math.round((p.endsAt - p.startsAt) / 60_000))}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-faint">Guest</dt>
          <dd className="text-ink">
            {p.guestName} <span className="text-muted">({p.guestEmail})</span>
          </dd>
        </div>
        {p.answers.map((a) => (
          <div key={a.label} className="flex gap-3">
            <dt className="w-16 shrink-0 text-faint">Asked</dt>
            <dd className="min-w-0 text-ink">
              <span className="block text-xs text-muted">{a.label}</span>
              <span className="whitespace-pre-line break-words">{a.value}</span>
            </dd>
          </div>
        ))}
      </dl>

      {confirmed && !over && (
        <>
          {p.joinUrl && (
            <div className="flex flex-col gap-2">
              <a href={p.joinUrl} className="btn-primary px-5 py-3 text-sm">
                Join the call
              </a>
              <p className="text-center text-xs text-faint">
                {startsSoon
                  ? 'It’s nearly time. The host will let you in.'
                  : 'Use this link at meeting time. It runs in your browser.'}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            <a
              href={p.googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost px-3 py-1.5"
            >
              Add to Google Calendar
            </a>
            <a href={`/booking/${p.token}/ics`} className="btn-ghost px-3 py-1.5">
              Download invite (.ics)
            </a>
            {p.rescheduleUrl && (
              <a href={p.rescheduleUrl} className="btn-ghost px-3 py-1.5">
                Reschedule
              </a>
            )}
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-muted transition hover:text-danger"
              onClick={() => setCancelling((c) => !c)}
            >
              Cancel booking
            </button>
          </div>
          {cancelling && (
            <div className="flex flex-col gap-2 rounded-2xl border border-danger/30 bg-danger/[0.06] p-4">
              <label className="flex flex-col gap-1 text-sm text-muted">
                Let them know why <span className="text-faint">(optional)</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={cancel}
                className="self-start rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-on-danger transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? 'Cancelling…' : 'Yes, cancel it'}
              </button>
            </div>
          )}
        </>
      )}

      {!confirmed && p.rebookUrl && !p.rescheduled && (
        <a href={p.rebookUrl} className="btn-ghost self-start px-4 py-2 text-sm">
          Book a new time
        </a>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
