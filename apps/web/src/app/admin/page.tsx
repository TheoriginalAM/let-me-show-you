import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buildShareUrl, formatRelativeDate } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { listOpenReports } from '@/db/reports'
import { listUsersForAdmin } from '@/db/users'
import { reportReasonLabel } from '@/lib/report-reasons'
import {
  approveUserAction,
  dismissReportAction,
  makeReportedVideoPrivateAction,
  revokeUserAction,
} from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/dashboard')

  const [users, reports] = await Promise.all([listUsersForAdmin(), listOpenReports()])
  // Pending first so new sign-ups surface at the top.
  const sorted = [...users].sort((a, b) => Number(a.approved) - Number(b.approved))
  const pendingCount = users.filter((u) => !u.approved).length

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-14 sm:px-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Admin</h1>
          <p className="mt-2 text-sm text-muted">
            {reports.length > 0 ? (
              <span className="font-medium text-danger">
                {reports.length} reported {reports.length === 1 ? 'link' : 'links'}
              </span>
            ) : (
              'No reported links'
            )}{' '}
            ·{' '}
            {pendingCount > 0 ? (
              <span className="font-medium text-warning">{pendingCount} awaiting approval</span>
            ) : (
              'Nobody awaiting approval'
            )}{' '}
            · {users.length} {users.length === 1 ? 'user' : 'users'}
          </p>
        </div>
        <Link href="/dashboard" className="btn-ghost px-4 py-2 text-sm">
          ← Dashboard
        </Link>
      </header>

      <section
        aria-labelledby="reports-heading"
        className="rise flex flex-col gap-3"
        style={{ animationDelay: '60ms' }}
      >
        <h2
          id="reports-heading"
          className="font-display text-xl font-extrabold tracking-tight text-ink"
        >
          Reported links
        </h2>
        {reports.length === 0 ? (
          <p className="glass rounded-2xl px-5 py-4 text-sm text-muted">
            No open reports. When a viewer reports a link, it shows up here and you get an email.
          </p>
        ) : (
          <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      <a
                        href={buildShareUrl(r.shareSlug)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-words underline-offset-2 hover:underline"
                      >
                        {r.videoTitle}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      {!r.isPublic && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-medium text-muted ring-1 ring-inset ring-line">
                          Private
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-faint">
                      {r.businessName} ·{' '}
                      <time dateTime={r.createdAt} title={new Date(r.createdAt).toUTCString()}>
                        {formatRelativeDate(r.createdAt)}
                      </time>
                    </p>
                  </div>
                  <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger ring-1 ring-inset ring-danger/25">
                    {reportReasonLabel(r.reason)}
                  </span>
                </div>
                {r.details && (
                  <p className="whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink">
                    {r.details}
                  </p>
                )}
                <p className="text-xs text-muted">
                  {r.reporterEmail ? (
                    <>
                      Reporter:{' '}
                      <a
                        href={`mailto:${r.reporterEmail}`}
                        className="font-medium text-accent-ink hover:underline"
                      >
                        {r.reporterEmail}
                      </a>
                    </>
                  ) : (
                    "The reporter didn't leave an email."
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={makeReportedVideoPrivateAction.bind(null, r.id)}>
                    <button
                      type="submit"
                      className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-on-danger transition hover:opacity-90"
                    >
                      Make private<span className="sr-only">: {r.videoTitle}</span>
                    </button>
                  </form>
                  <form action={dismissReportAction.bind(null, r.id)}>
                    <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                      Dismiss<span className="sr-only"> this report on {r.videoTitle}</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="users-heading"
        className="rise flex flex-col gap-3"
        style={{ animationDelay: '120ms' }}
      >
        <h2
          id="users-heading"
          className="font-display text-xl font-extrabold tracking-tight text-ink"
        >
          Users
        </h2>
        <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
          {sorted.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-medium text-ink">
                  {u.name}
                  {u.role === 'admin' && (
                    <span className="rounded bg-accent-strong/20 px-1.5 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-accent-ink ring-1 ring-inset ring-accent/30">
                      admin
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-faint">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {u.approved ? (
                  <>
                    <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-success/25">
                      Approved
                    </span>
                    {u.role !== 'admin' && (
                      <form action={revokeUserAction.bind(null, u.id)}>
                        <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                          Revoke
                        </button>
                      </form>
                    )}
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-hl-orange/60">
                      Pending
                    </span>
                    <form action={approveUserAction.bind(null, u.id)}>
                      <button type="submit" className="btn-primary px-3.5 py-1.5 text-xs">
                        Approve
                      </button>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
