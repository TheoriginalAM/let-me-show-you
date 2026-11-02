'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  MAX_QUESTIONS,
  QUESTION_KIND_LABELS,
  type BookingQuestion,
  type QuestionKind,
} from '@/lib/booking-questions'
import {
  DEFAULT_WEEKLY_HOURS,
  WEEKDAY_NAMES,
  parseClock,
  type WeeklyHours,
} from '@/lib/booking-time'
import { colourName } from '../colour-names'
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
  questions: BookingQuestion[]
  confirmationMessage: string | null
  remindersEnabled: boolean
  color: string | null
  active: boolean
  hostUserId: string
  hostName: string
}

export const inputCls =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none'
const smallInput =
  'rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-ink focus:outline-none'
const CALENDAR_COLORS = [
  '#4f3cff',
  '#ff5fa2',
  '#ff8f2e',
  '#ffd23f',
  '#2fd98a',
  '#0ea5e9',
  '#e11d48',
  '#17132b',
]

function slugFrom(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 48)
    .replace(/-+$/, '')
}

function newQuestion(): BookingQuestion {
  return {
    id: `q${Math.random().toString(36).slice(2, 9)}`,
    label: '',
    kind: 'short',
    required: false,
  }
}

const DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const STEPS = [10, 15, 20, 30, 60]
const BUFFERS = [0, 5, 10, 15, 30, 45, 60]
// Monday first, as people read a week.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function zoneList(current: string): string[] {
  let zones: string[] = []
  try {
    zones =
      (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
        'timeZone',
      ) ?? []
  } catch {
    zones = []
  }
  return [...new Set([current, ...zones])].sort()
}

export function EventTypeEditor({
  initial,
  pageUrl,
  brandColor,
  onDone,
}: {
  initial: EventTypeItem | null
  pageUrl: string
  brandColor: string | null
  onDone: () => void
}) {
  const browserZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney',
    [],
  )
  const [title, setTitle] = useState(initial?.title ?? '30 minute call')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 30)
  const [step, setStep] = useState(initial?.slotStepMinutes ?? 30)
  const [before, setBefore] = useState(initial?.bufferBeforeMinutes ?? 0)
  const [after, setAfter] = useState(initial?.bufferAfterMinutes ?? 0)
  const [noticeHours, setNoticeHours] = useState(
    Math.round((initial?.minNoticeMinutes ?? 240) / 60),
  )
  const [maxDays, setMaxDays] = useState(initial?.maxDaysAhead ?? 60)
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? browserZone)
  const [hours, setHours] = useState<WeeklyHours>(initial?.weeklyHours ?? DEFAULT_WEEKLY_HOURS)
  const [slug, setSlug] = useState(initial?.slug ?? '')
  // A new calendar's link follows its name until someone edits the link.
  const [slugTouched, setSlugTouched] = useState(Boolean(initial))
  const [color, setColor] = useState<string | null>(initial?.color ?? null)
  const [questions, setQuestions] = useState<BookingQuestion[]>(initial?.questions ?? [])
  const [message, setMessage] = useState(initial?.confirmationMessage ?? '')
  const [reminders, setReminders] = useState(initial?.remindersEnabled ?? true)
  const shownSlug = slugTouched ? slug : slugFrom(title)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const zones = useMemo(() => zoneList(timeZone), [timeZone])

  function setDay(day: number, windows: WeeklyHours[number]): void {
    setHours((h) => h.map((w, i) => (i === day ? windows : w)))
  }

  function save(): void {
    setError(null)
    // Catch the easy mistakes here; the server checks everything again.
    for (const q of questions) {
      if (!q.label.trim()) {
        setError('Each question needs some wording (or remove it).')
        return
      }
      if (q.kind === 'choice' && (q.options ?? []).filter((o) => o.trim()).length < 2) {
        setError(`“${q.label}” needs at least two options.`)
        return
      }
    }
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
        slug: shownSlug,
        color,
        questions,
        confirmationMessage: message,
        remindersEnabled: reminders,
        active: initial?.active ?? true,
      }).catch(() => ({
        ok: false as const,
        error: "Couldn't save the calendar. Check your connection and try again.",
      }))
      if (res.ok) onDone()
      else setError(res.error)
    })
  }

  return (
    <div className="card flex flex-col gap-6 rounded-2xl border-2 border-ink p-5 sm:p-6">
      <h3 className="font-display text-xl font-extrabold tracking-tight text-ink">
        {initial ? `Edit ${initial.title}` : 'New calendar'}
      </h3>

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Name
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Length
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={inputCls}
          >
            {[...new Set([...DURATIONS, duration])]
              .sort((a, b) => a - b)
              .map((d) => (
                <option key={d} value={d}>
                  {d < 60
                    ? `${d} min`
                    : d % 60
                      ? `${Math.floor(d / 60)} hr ${d % 60} min`
                      : `${d / 60} hr`}
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

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
          Link
          <span className="flex min-w-0 items-center overflow-hidden rounded-xl border border-line-strong bg-surface focus-within:border-ink">
            <span
              className="max-w-[55%] shrink-0 truncate bg-surface-2 px-3 py-2.5 font-mono text-xs text-faint"
              dir="rtl"
            >
              <bdi dir="ltr">{pageUrl.replace('https://', '')}/</bdi>
            </span>
            <input
              value={shownSlug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }}
              maxLength={48}
              placeholder="intro-call"
              aria-label="Calendar link"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-ink focus:outline-none"
            />
          </span>
          {initial && shownSlug !== initial.slug && (
            <span className="text-xs text-faint">
              The old link keeps working and sends people here.
            </span>
          )}
        </label>
        <fieldset className="flex flex-col gap-1 text-sm text-muted">
          <legend className="mb-1">Colour</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColor(null)}
              aria-pressed={color === null}
              className={`h-8 rounded-full px-3 text-xs font-medium transition ${
                color === null
                  ? 'bg-ink text-canvas'
                  : 'border border-line-strong text-muted hover:text-ink'
              }`}
            >
              Brand
            </button>
            {CALENDAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={colourName(c)}
                title={colourName(c)}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full transition hover:scale-110 ${color === c ? 'ring-[3px] ring-ink ring-offset-2 ring-offset-[var(--color-surface)]' : ''}`}
                style={{ background: c }}
              />
            ))}
            <span
              className="ml-1 h-8 w-8 rounded-full border-2 border-dashed border-line-strong"
              style={{ background: color ?? brandColor ?? 'var(--color-accent)' }}
              title="This calendar’s colour"
              aria-hidden
            />
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-sm font-semibold text-ink">When you&rsquo;re available</span>
          <label className="flex items-center gap-2 text-sm text-muted">
            Time zone
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className={smallInput}
            >
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
                    onChange={(e) =>
                      setDay(day, e.target.checked ? [{ start: '09:00', end: '17:00' }] : [])
                    }
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  {WEEKDAY_NAMES[day]}
                </label>
                {on ? (
                  // The min width drops the hours under the day name on a phone
                  // instead of squeezing them beside it; each row then wraps.
                  <div className="flex min-w-[14rem] flex-1 flex-col gap-1.5">
                    {windows.map((w, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          value={w.start}
                          step={300}
                          aria-label={`${WEEKDAY_NAMES[day]} from`}
                          onChange={(e) =>
                            setDay(
                              day,
                              windows.map((x, j) =>
                                j === i ? { ...x, start: e.target.value } : x,
                              ),
                            )
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
                            setDay(
                              day,
                              windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                            )
                          }
                          className={smallInput}
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${WEEKDAY_NAMES[day]} ${w.start} to ${w.end}`}
                          className="px-2 text-faint transition hover:text-danger"
                          onClick={() =>
                            setDay(
                              day,
                              windows.filter((_, j) => j !== i),
                            )
                          }
                        >
                          ×
                        </button>
                        {i === windows.length - 1 && (
                          <button
                            type="button"
                            className="text-sm text-faint transition hover:text-ink"
                            aria-label={`Add more hours on ${WEEKDAY_NAMES[day]}`}
                            onClick={() =>
                              setDay(day, [...windows, { start: '13:00', end: '17:00' }])
                            }
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

      <QuestionsEditor questions={questions} onChange={setQuestions} />

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold text-ink">After they book</span>
        <label className="flex flex-col gap-1 text-sm text-muted">
          <span>
            Thank-you message{' '}
            <span className="text-faint">(shown on their booking page and in the email)</span>
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Thanks for booking! Have your current website open and we’ll go through it together."
            className={inputCls}
          />
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <input
            type="checkbox"
            checked={reminders}
            onChange={(e) => setReminders(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
          />
          <span>
            <span className="block font-medium text-ink">Send reminder emails</span>
            <span className="block text-muted">
              A day before and an hour before, with the link to join.
            </span>
          </span>
        </label>
      </div>

      <details className="rounded-xl border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer text-muted">More options</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-muted">
            Offer start times every
            <select
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              className={inputCls}
            >
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
            <select
              value={before}
              onChange={(e) => setBefore(Number(e.target.value))}
              className={inputCls}
            >
              {[...new Set([...BUFFERS, before])]
                .sort((a, b) => a - b)
                .map((b) => (
                  <option key={b} value={b}>
                    {b ? `${b} min` : 'None'}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Break after
            <select
              value={after}
              onChange={(e) => setAfter(Number(e.target.value))}
              className={inputCls}
            >
              {[...new Set([...BUFFERS, after])]
                .sort((a, b) => a - b)
                .map((b) => (
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

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
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

function QuestionsEditor({
  questions,
  onChange,
}: {
  questions: BookingQuestion[]
  onChange: (questions: BookingQuestion[]) => void
}) {
  function update(i: number, patch: Partial<BookingQuestion>): void {
    onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  }
  function move(i: number, by: -1 | 1): void {
    const next = [...questions]
    const [q] = next.splice(i, 1)
    next.splice(i + by, 0, q!)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="text-sm font-semibold text-ink">Questions</span>
        <p className="text-sm text-muted">
          Name and email are always asked. Add anything else you need to know before the call.
        </p>
      </div>
      {questions.map((q, i) => (
        <div
          key={q.id}
          className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q.label}
              onChange={(e) => update(i, { label: e.target.value })}
              maxLength={140}
              placeholder="What’s your website?"
              aria-label={`Question ${i + 1}`}
              className={`${inputCls} min-w-[12rem] flex-1`}
            />
            <select
              value={q.kind}
              onChange={(e) => {
                const kind = e.target.value as QuestionKind
                update(i, {
                  kind,
                  options:
                    kind === 'choice' ? (q.options?.length ? q.options : ['', '']) : undefined,
                })
              }}
              aria-label="Answer type"
              className={`${smallInput} py-2.5`}
            >
              {(Object.keys(QUESTION_KIND_LABELS) as QuestionKind[]).map((k) => (
                <option key={k} value={k}>
                  {QUESTION_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          {q.kind === 'choice' && (
            <div className="flex flex-col gap-1.5 pl-1">
              {(q.options ?? []).map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border-2 border-line-strong"
                    aria-hidden
                  />
                  <input
                    value={o}
                    onChange={(e) =>
                      update(i, {
                        options: (q.options ?? []).map((x, xi) => (xi === oi ? e.target.value : x)),
                      })
                    }
                    maxLength={80}
                    placeholder={`Option ${oi + 1}`}
                    aria-label={`Option ${oi + 1}`}
                    className={`${smallInput} flex-1`}
                  />
                  {(q.options ?? []).length > 2 && (
                    <button
                      type="button"
                      aria-label={`Remove option ${oi + 1}`}
                      className="px-1 text-faint hover:text-danger"
                      onClick={() =>
                        update(i, { options: (q.options ?? []).filter((_, xi) => xi !== oi) })
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {(q.options ?? []).length < 10 && (
                <button
                  type="button"
                  className="self-start text-sm text-accent-ink hover:underline"
                  onClick={() => update(i, { options: [...(q.options ?? []), ''] })}
                >
                  + Add option
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => update(i, { required: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Required
            </label>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                className="px-2 text-faint hover:text-ink disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move question ${i + 1} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className="px-2 text-faint hover:text-ink disabled:opacity-30"
                disabled={i === questions.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move question ${i + 1} down`}
              >
                ↓
              </button>
              <button
                type="button"
                className="px-2 text-faint hover:text-danger"
                onClick={() => onChange(questions.filter((_, j) => j !== i))}
                aria-label={`Remove question ${i + 1}`}
              >
                Remove
              </button>
            </span>
          </div>
        </div>
      ))}
      {questions.length < MAX_QUESTIONS && (
        <button
          type="button"
          className="btn-ghost self-start px-3 py-1.5 text-sm"
          onClick={() => onChange([...questions, newQuestion()])}
        >
          + Add a question
        </button>
      )}
    </div>
  )
}
