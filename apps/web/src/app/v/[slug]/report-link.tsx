'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { MAX_REPORT_DETAILS, REPORT_REASONS, type ReportReason } from '@/lib/report-reasons'
import { reportLink } from './report-actions'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const REASONS = Object.entries(REPORT_REASONS) as [ReportReason, string][]

const inputCls =
  'mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none'

/**
 * "Report this link" in the share page footer. Opens a small dialog that sends
 * the report to the admins. Escape (or Cancel) closes it and puts focus back
 * on the link.
 */
export function ReportLink({ slug }: { slug: string }) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const firstReasonRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLButtonElement>(null)

  const [reason, setReason] = useState<ReportReason | ''>('')
  const [details, setDetails] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  // Once sent, the form is gone: move focus to the button that closes the dialog.
  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  function open() {
    setError(null)
    dialogRef.current?.showModal()
    if (done) doneRef.current?.focus()
    else firstReasonRef.current?.focus()
  }

  function close() {
    dialogRef.current?.close()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    if (!reason) {
      setError('Choose a reason for your report.')
      firstReasonRef.current?.focus()
      return
    }
    const cleanEmail = email.trim()
    if (cleanEmail && !EMAIL_RE.test(cleanEmail)) {
      setError('Check your email address, or leave it blank.')
      emailRef.current?.focus()
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await reportLink(slug, {
        reason,
        details: details.trim(),
        email: cleanEmail,
        website,
      }).catch(() => ({
        ok: false as const,
        error: "Couldn't send your report. Check your connection and try again.",
      }))
      if (result.ok) setDone(true)
      else setError(result.error)
    })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="font-medium text-muted underline-offset-2 transition hover:text-ink hover:underline"
      >
        Report this link
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-intro`}
        // Escape, Cancel and a click outside all end here.
        onClose={() => triggerRef.current?.focus()}
        onClick={(e) => {
          if (e.target === dialogRef.current) close()
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line-strong bg-canvas text-ink shadow-[0_30px_80px_-30px_rgba(23,19,43,0.55)] backdrop:bg-black/50"
      >
        <div className="relative flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id={`${id}-title`}
                className="font-display text-xl font-extrabold tracking-tight text-ink"
              >
                Report this link
              </h2>
              <p id={`${id}-intro`} className="mt-1 text-sm text-muted">
                Tell us what&rsquo;s wrong with this recording. We review every report.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {!done && (
            <form noValidate onSubmit={submit} className="flex flex-col gap-4">
              <fieldset>
                <legend className="text-sm font-semibold text-ink">
                  Reason <span className="font-normal text-faint">(required)</span>
                </legend>
                <div className="mt-2 flex flex-col gap-1.5">
                  {REASONS.map(([key, label], i) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-line-strong has-checked:border-accent has-checked:bg-accent/10"
                    >
                      <input
                        ref={i === 0 ? firstReasonRef : undefined}
                        type="radio"
                        name={`${id}-reason`}
                        value={key}
                        checked={reason === key}
                        onChange={() => setReason(key)}
                        required
                        className="h-4 w-4 shrink-0 accent-accent"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor={`${id}-details`} className="text-sm font-semibold text-ink">
                  Details <span className="font-normal text-faint">(optional)</span>
                </label>
                <textarea
                  id={`${id}-details`}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={MAX_REPORT_DETAILS}
                  rows={3}
                  aria-describedby={`${id}-details-count`}
                  className={`${inputCls} resize-y`}
                />
                <p id={`${id}-details-count`} className="mt-1 text-xs text-faint">
                  {details.length} of {MAX_REPORT_DETAILS} characters
                </p>
              </div>

              <div>
                <label htmlFor={`${id}-email`} className="text-sm font-semibold text-ink">
                  Your email <span className="font-normal text-faint">(optional)</span>
                </label>
                <input
                  ref={emailRef}
                  id={`${id}-email`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  autoComplete="email"
                  aria-describedby={`${id}-email-hint`}
                  className={inputCls}
                />
                <p id={`${id}-email-hint`} className="mt-1 text-xs text-faint">
                  Only if you&rsquo;d like us to follow up with you.
                </p>
              </div>

              {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
              <div aria-hidden className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
                <label>
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={close} className="btn-ghost px-4 py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm">
                  {pending ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </form>
          )}

          {/* Always in the page, so the thank-you is announced when it appears. */}
          <p role="status" className={done ? 'text-sm text-ink' : 'sr-only'}>
            {done ? "Thanks. We'll take a look." : ''}
          </p>

          {done && (
            <div className="flex justify-end">
              <button
                ref={doneRef}
                type="button"
                onClick={close}
                className="btn-primary px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}
