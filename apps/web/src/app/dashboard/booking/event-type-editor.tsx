'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  DEFAULT_WEEKLY_HOURS,
  WEEKDAY_NAMES,
  parseClock,
  type WeeklyHours,
} from '@/lib/booking-time'
import { saveEventTypeAction } from './actions'

export interface EventTypeItem {
  id: string
  title: string
  slug: string
  description: string | null
  durationMinutes: number
  slotStepMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  maxDaysAhead: number
  timeZone: string
  weeklyHours: WeeklyHours
  active: boolean
  hostUserId: string
  hostName: string
}

export const inputCls =
  'w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none'
const smallInput =
  'rounded-lg border border-line bg-white/[0.03] px-2 py-1.5 text-sm text-ink focus:border-line-strong focus:outline-none'

const DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const STEPS = [10, 15, 20, 30, 60]
const BUFFERS = [0, 5, 10, 15, 30, 45, 60]
// Monday first, as people read a week.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function zoneList(current: string): string[] {
  let zones: string[] = []
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    zones = []
  }
  return [...new Set([current, ...zones])].sort()
}

export function EventTypeEditor({
  initial,
  onDone,
}: {
  initial: EventTypeItem | null
  onDone: () => void
}) {
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney', [])
  const [title, setTitle] = useState(initial?.title ?? '30 minute call')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 30)
  const [step, setStep] = useState(initial?.slotStepMinutes ?? 30)
  const [before, setBefore] = useState(initial?.bufferBeforeMinutes ?? 0)
  const [after, setAfter] = useState(initial?.bufferAfterMinutes ?? 0)
  const [noticeHours, setNoticeHours] = useState(Math.round((initial?.minNoticeMinutes ?? 240) / 60))
  const [maxDays, setMaxDays] = useState(initial?.maxDaysAhead ?? 60)
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? browserZone)
  const [hours, setHours] = useState<WeeklyHours>(initial?.weeklyHours ?? DEFAULT_WEEKLY_HOURS)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const zones = useMemo(() => zoneList(timeZone), [timeZone])

  function setDay(day: number, windows: WeeklyHours[number]): void {
    setHours((h) => h.map((w, i) => (i === day ? windows : w)))
  }

  function save(): void {
    setError(null)
    // Catch the easy mistakes here; the server checks everything again.
    for (const day of DAY_ORDER) {
      for (const w of hours[day] ?? []) {
        const s = parseClock(w.start)
        const e = parseClock(w.end)
        if (s === null || e === null || e <= s) {
          setError(`${WEEKDAY_NAMES[day]}: each block needs to end after it starts.`)
          return
        }
      }
    }
    startTransition(async () => {
      const res = await saveEventTypeAction(initial?.id ?? null, {
        title,
        description,
        durationMinutes: duration,
        slotStepMinutes: step,
        bufferBeforeMinutes: before,
        bufferAfterMinutes: after,
        minNoticeMinutes: Math.max(0, Math.round(noticeHours * 60)),
        maxDaysAhead: maxDays,
        timeZone,
        weeklyHours: hours,
        active: initial?.active ?? true,
      }).catch(() => ({ ok: false as const, error: 'Could not save. Please try again.' }))
      if (res.ok) onDone()
      else setError(res.error)
    })
  }

  return (
    <div className="glass rise flex flex-col gap-5 rounded-2xl p-5">
      <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
        {initial ? `Edit ${initial.title}` : 'New booking type'}
      </h3>

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Name
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Length
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
            {[...new Set([...DURATIONS, duration])]
              .sort((a, b) => a - b)
              .map((d) => (
                <option key={d} value={d}>
                  {d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} hr ${d % 60} min` : `${d / 60} hr`}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-muted">
        <span>
          Description <span className="text-faint">(shown on the booking page)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="What the call is for, what to prepare…"
          className={inputCls}
        />
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-sm font-semibold text-ink">When you&rsquo;re available</span>
          <label className="flex items-center gap-2 text-sm text-muted">
            Time zone
            <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className={smallInput}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {DAY_ORDER.map((day) => {
            const windows = hours[day] ?? []
            const on = windows.length > 0
            return (
              <div key={day} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                <label className="flex w-32 cursor-pointer items-center gap-2 pt-1.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setDay(day, e.target.checked ? [{ start: '09:00', end: '17:00' }] : [])}
                    className="h-4 w-4 accent-[#8b8bf6]"
                  />
                  {WEEKDAY_NAMES[day]}
                </label>
                {on ? (
                  <div className="flex flex-1 flex-col gap-1.5">
                    {windows.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={w.start}
                          step={300}
                          aria-label={`${WEEKDAY_NAMES[day]} from`}
                          onChange={(e) =>
                            setDay(day, windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                          }
                          className={smallInput}
                        />
                        <span className="text-faint">to</span>
                        <input
                          type="time"
                          value={w.end === '24:00' ? '23:59' : w.end}
                          step={300}
                          aria-label={`${WEEKDAY_NAMES[day]} until`}
                          onChange={(e) =>
                            setDay(day, windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                          }
                          className={smallInput}
                        />
                        <button
                          type="button"
                          aria-label="Remove these hours"
                          className="px-2 text-faint transition hover:text-red-300"
                          onClick={() => setDay(day, windows.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                        {i === windows.length - 1 && (
                          <button
                            type="button"
                            className="text-sm text-faint transition hover:text-ink"
                            onClick={() => setDay(day, [...windows, { start: '13:00', end: '17:00' }])}
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="pt-1.5 text-sm text-faint">Unavailable</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <details className="rounded-xl border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer text-muted">More options</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-muted">
            Offer start times every
            <select value={step} onChange={(e) => setStep(Number(e.target.value))} className={inputCls}>
              {[...new Set([...STEPS, step])]
                .sort((a, b) => a - b)
                .map((s) => (
                  <option key={s} value={s}>
                    {s} min
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Minimum notice (hours)
            <input
              type="number"
              min={0}
              max={720}
              value={noticeHours}
              onChange={(e) => setNoticeHours(Number(e.target.value))}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Break before
            <select value={before} onChange={(e) => setBefore(Number(e.target.value))} className={inputCls}>
              {[...new Set([...BUFFERS, before])].sort((a, b) => a - b).map((b) => (
                <option key={b} value={b}>
                  {b ? `${b} min` : 'None'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Break after
            <select value={after} onChange={(e) => setAfter(Number(e.target.value))} className={inputCls}>
              {[...new Set([...BUFFERS, after])].sort((a, b) => a - b).map((b) => (
                <option key={b} value={b}>
                  {b ? `${b} min` : 'None'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Bookable up to (days ahead)
            <input
              type="number"
              min={1}
              max={365}
              value={maxDays}
              onChange={(e) => setMaxDays(Number(e.target.value))}
              className={inputCls}
            />
          </label>
        </div>
      </details>

      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-5 py-2.5 text-sm" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Create'}
        </button>
        <button className="btn-ghost px-4 py-2.5 text-sm" disabled={pending} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}
