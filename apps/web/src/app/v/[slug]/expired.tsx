'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatExpiryDate } from '@/lib/link-expiry'

function ClockIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/** Shown instead of the recording once its share link has expired. */
export function LinkExpired({ businessName }: { businessName: string }) {
  return (
    <div className="rise card flex flex-col items-center gap-4 rounded-3xl px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 ring-1 ring-line">
        <ClockIcon className="h-7 w-7 text-muted" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          This link has expired
        </h1>
        <p className="mx-auto max-w-sm text-muted">
          Ask {businessName} for a new link if you still need to see this recording.
        </p>
      </div>
    </div>
  )
}

/**
 * For the business itself: the link has expired for everyone else, but they
 * can still watch, and can give it more time from the dashboard.
 */
export function ExpiredBanner({ expiresAt }: { expiresAt: string }) {
  // The server doesn't know the reader's time zone: start in the business's,
  // then switch to the browser's once it's running.
  const [zone, setZone] = useState<string | undefined>('Australia/Sydney')
  useEffect(() => setZone(undefined), [])

  return (
    <div className="rise flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
      <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <p>
        This link expired on{' '}
        <strong className="font-semibold">{formatExpiryDate(expiresAt, zone)}</strong>. Viewers
        can&rsquo;t watch it.{' '}
        <Link
          href="/dashboard"
          className="font-semibold text-accent-ink underline underline-offset-2 transition hover:opacity-80"
        >
          Change it from your dashboard.
        </Link>
      </p>
    </div>
  )
}
