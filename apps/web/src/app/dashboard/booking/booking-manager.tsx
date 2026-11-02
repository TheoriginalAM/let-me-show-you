'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { BookingListItem, TimeOffItem } from '@/db/bookings'
import { formatDay, formatDuration, formatTime, zonedParts } from '@/lib/booking-time'
import {
  addTimeOffAction,
  cancelBookingAction,
  deleteEventTypeAction,
  removeTimeOffAction,
  setBookingSlugAction,
  setEventTypeActiveAction,
} from './actions'
import { EventTypeEditor, inputCls, type EventTypeItem } from './event-type-editor'

interface Props {
  domain: string
  pageSlug: string
  isOwner: boolean
  meId: string
  eventTypes: EventTypeItem[]
  upcoming: BookingListItem[]
  past: BookingListItem[]
  timeOff: TimeOffItem[]
}

function useViewerZone(): string {
  const [tz, setTz] = useState('Australia/Sydney')
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'), [])
  return tz
}

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  return [
    copied,
    (key, text) => {
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(key)
          setTimeout(() => setCopied(null), 2000)
        })
        .catch(() => undefined)
    },
  ]
}

export function BookingManager(props: Props) {
  const tz = useViewerZone()
  const [copied, copy] = useCopy()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const pageUrl = `https://${props.domain}/book/${props.pageSlug}`

  return (
    <div className="flex flex-col gap-8">
      <PageLinkCard
        url={pageUrl}
        slug={props.pageSlug}
        domain={props.domain}
        isOwner={props.isOwner}
        copied={copied === 'page'}
        onCopy={() => copy('page', pageUrl)}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink">What people can book</h2>
          {editing !== 'new' && (
            <button className="btn-primary px-4 py-2 text-sm" onClick={() => setEditing('new')}>
              New booking type
            </button>
          )}
        </div>
        {editing === 'new' && <EventTypeEditor initial={null} onDone={() => setEditing(null)} />}
        {props.eventTypes.length === 0 && editing !== 'new' && (
          <div className="glass rounded-2xl border-dashed p-8 text-center text-sm text-muted">
            Nothing to book yet. Create a booking type (say, a 30 minute intro call) and share the link.
          </div>
        )}
        {props.eventTypes.map((e) =>
          editing === e.id ? (
            <EventTypeEditor key={e.id} initial={e} onDone={() => setEditing(null)} />
          ) : (
            <EventTypeCard
              key={e.id}
              event={e}
              url={`${pageUrl}/${e.slug}`}
              isMine={e.hostUserId === props.meId}
              copied={copied === e.id}
              onCopy={() => copy(e.id, `${pageUrl}/${e.slug}`)}
              onEdit={() => setEditing(e.id)}
            />
          ),
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Upcoming</h2>
        {props.upcoming.length === 0 ? (
          <p className="text-sm text-muted">No upcoming bookings.</p>
        ) : (
          <BookingList items={props.upcoming} tz={tz} cancellable />
        )}
      </section>

      <TimeOffSection items={props.timeOff} tz={tz} />

      {props.past.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer font-display text-lg font-semibold tracking-tight text-muted">
            Past bookings
          </summary>
          <div className="mt-3">
            <BookingList items={props.past} tz={tz} />
          </div>
        </details>
      )}
    </div>
  )
}

function PageLinkCard(p: {
  url: string
  slug: string
  domain: string
  isOwner: boolean
  copied: boolean
  onCopy: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [slug, setSlug] = useState(p.slug)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(): void {
    setError(null)
    startTransition(async () => {
      const res = await setBookingSlugAction(slug).catch(() => ({ ok: false as const, error: 'Try again.' }))
      if (res.ok) setEditing(false)
      else setError(res.error)
    })
  }

  return (
    <div className="glass rise rounded-2xl p-5">
      <p className="text-sm text-muted">Your booking page</p>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="shrink-0 font-mono text-sm text-faint">{p.domain}/book/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            maxLength={48}
            className={`${inputCls} font-mono`}
            autoFocus
          />
          <button className="btn-primary shrink-0 px-4 py-2 text-sm" disabled={pending} onClick={save}>
            Save
          </button>
          <button
            className="btn-ghost shrink-0 px-3 py-2 text-sm"
            onClick={() => {
              setSlug(p.slug)
              setEditing(false)
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className="mt-1 break-all font-mono text-lg text-ink">{p.url.replace('https://', '')}</p>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={p.onCopy}>
            {p.copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={`/book/${p.slug}`} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-sm">
            Open
          </a>
          {p.isOwner && (
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(true)}>
              Change address
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function hoursSummary(e: EventTypeItem): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const open = [1, 2, 3, 4, 5, 6, 0].filter((d) => (e.weeklyHours[d] ?? []).length > 0)
  if (open.length === 0) return 'No hours set'
  return open.map((d) => days[d]).join(', ')
}

function EventTypeCard(p: {
  event: EventTypeItem
  url: string
  isMine: boolean
  copied: boolean
  onCopy: () => void
  onEdit: () => void
}) {
  const e = p.event
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  function run(fn: () => Promise<{ ok: boolean; error?: string }>): void {
    setNote(null)
    startTransition(async () => {
      const res = await fn().catch(() => ({ ok: false, error: 'Try again.' }))
      if (!res.ok) setNote(res.error ?? 'Something went wrong.')
    })
  }

  return (
    <div className={`glass rise rounded-2xl p-5 ${e.active ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold tracking-tight text-ink">{e.title}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {formatDuration(e.durationMinutes)} · {hoursSummary(e)} · {e.timeZone.replace(/_/g, ' ')}
            {!p.isMine && ` · hosted by ${e.hostName}`}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-faint">{p.url.replace('https://', '')}</p>
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={e.active}
            disabled={pending}
            onChange={(ev) => run(() => setEventTypeActiveAction(e.id, ev.target.checked))}
            className="h-4 w-4 accent-[#8b8bf6]"
          />
          {e.active ? 'Taking bookings' : 'Off'}
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={p.onCopy}>
          {p.copied ? 'Copied' : 'Copy link'}
        </button>
        <a href={p.url.replace(/^https:\/\/[^/]+/, '')} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-sm">
          Preview
        </a>
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={p.onEdit}>
          Edit
        </button>
        <button
          className={`ml-auto rounded-lg px-3 py-1.5 text-sm transition ${
            confirmDelete ? 'bg-red-500/20 text-red-200' : 'text-faint hover:text-red-300'
          }`}
          disabled={pending}
          onClick={() => (confirmDelete ? run(() => deleteEventTypeAction(e.id)) : setConfirmDelete(true))}
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>
      {confirmDelete && (
        <p className="mt-2 text-xs text-faint">Bookings already made stay on your calendar.</p>
      )}
      {note && <p className="mt-2 text-sm text-red-300">{note}</p>}
    </div>
  )
}

function BookingList({ items, tz, cancellable = false }: { items: BookingListItem[]; tz: string; cancellable?: boolean }) {
  // Group by day in the viewer's zone.
  const groups = useMemo(() => {
    const out: { day: string; label: string; items: BookingListItem[] }[] = []
    for (const b of items) {
      const t = new Date(b.startsAt).getTime()
      const day = zonedParts(t, tz).date
      let g = out.find((x) => x.day === day)
      if (!g) {
        g = {
          day,
          label: new Intl.DateTimeFormat('en-AU', {
            timeZone: tz,
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date(t)),
          items: [],
        }
        out.push(g)
      }
      g.items.push(b)
    }
    return out
  }, [items, tz])

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.day} className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">{g.label}</p>
          {g.items.map((b) => (
            <BookingRow key={b.id} b={b} tz={tz} cancellable={cancellable} />
          ))}
        </div>
      ))}
    </div>
  )
}

function BookingRow({ b, tz, cancellable }: { b: BookingListItem; tz: string; cancellable: boolean }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const start = new Date(b.startsAt).getTime()
  const end = new Date(b.endsAt).getTime()
  const cancelled = b.status !== 'confirmed'

  function cancel(): void {
    setError(null)
    startTransition(async () => {
      const res = await cancelBookingAction(b.id, reason).catch(() => ({ ok: false as const, error: 'Try again.' }))
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div className={`glass rounded-xl p-4 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {formatTime(start, tz)} to {formatTime(end, tz)}{' '}
            <span className="font-normal text-muted">· {b.title}</span>
          </p>
          <p className="text-sm text-muted">
            {b.guestName}{' '}
            <a href={`mailto:${b.guestEmail}`} className="text-faint underline-offset-2 hover:underline">
              {b.guestEmail}
            </a>
            {b.hostName && <span className="text-faint"> · with {b.hostName}</span>}
          </p>
          {b.guestNotes && <p className="mt-1 whitespace-pre-line text-sm text-faint">“{b.guestNotes}”</p>}
          {cancelled && (
            <p className="mt-1 text-xs text-red-300">
              Cancelled by {b.cancelledBy === 'host' ? 'you' : 'the guest'}
              {b.cancelReason ? `: ${b.cancelReason}` : ''}
            </p>
          )}
        </div>
        {!cancelled && (
          <div className="flex shrink-0 gap-2">
            {b.roomSlug && (
              <a href={`/m/${b.roomSlug}`} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-sm">
                Open room
              </a>
            )}
            {cancellable && (
              <button
                className="rounded-lg px-3 py-1.5 text-sm text-faint transition hover:text-red-300"
                onClick={() => setOpen((o) => !o)}
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
      {open && !cancelled && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Reason for the guest (optional)"
            className={inputCls}
          />
          <button
            className="shrink-0 rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
            disabled={pending}
            onClick={cancel}
          >
            {pending ? 'Cancelling…' : 'Cancel and email them'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
  )
}

function TimeOffSection({ items, tz }: { items: TimeOffItem[]; tz: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function add(): void {
    setError(null)
    startTransition(async () => {
      const res = await addTimeOffAction(from, to || from, tz, note).catch(() => ({
        ok: false as const,
        error: 'Try again.',
      }))
      if (res.ok) {
        setFrom('')
        setTo('')
        setNote('')
      } else setError(res.error)
    })
  }

  function remove(id: string): void {
    startTransition(async () => {
      await removeTimeOffAction(id).catch(() => undefined)
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Time off</h2>
        <p className="text-sm text-muted">Days you can&rsquo;t be booked, for every business you run.</p>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((t) => {
            const s = new Date(t.startsAt).getTime()
            // Stored end is exclusive (midnight after the last day).
            const e = new Date(t.endsAt).getTime() - 1
            return (
              <li key={t.id} className="glass flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm">
                <span className="text-ink">
                  {formatDay(s, tz)}
                  {zonedParts(s, tz).date !== zonedParts(e, tz).date && ` to ${formatDay(e, tz)}`}
                  {t.note && <span className="text-muted"> · {t.note}</span>}
                </span>
                <button
                  className="text-faint transition hover:text-red-300"
                  disabled={pending}
                  onClick={() => remove(t.id)}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="glass flex flex-col gap-2 rounded-2xl p-4 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm text-muted">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          To
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
          Note <span className="sr-only">(optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
            placeholder="Holiday (optional)"
            className={inputCls}
          />
        </label>
        <button className="btn-primary shrink-0 px-4 py-2.5 text-sm" disabled={pending || !from} onClick={add}>
          Block days
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </section>
  )
}
