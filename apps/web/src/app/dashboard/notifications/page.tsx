import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { formatRelativeDate } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { listNotifications, markAllNotificationsRead } from '@/db/app-notifications'
import { PageHeader } from '../page-header'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  // Capture the list with its current read state, then mark everything read so
  // the next visit shows a clear badge.
  const items = await listNotifications(user.id)
  await markAllNotificationsRead(user.id)

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        title="Notifications"
        description="Comments, approvals, bookings and people waiting to join your calls."
      />

      {items.length === 0 ? (
        <div className="glass rise rounded-2xl border-dashed p-12 text-center">
          <p className="text-muted">Nothing yet. Comments and workspace activity will show here.</p>
        </div>
      ) : (
        <ul className="rise flex flex-col gap-2">
          {items.map((n) => {
            const inner = (
              <div
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition ${
                  n.read ? 'border-line bg-surface' : 'border-accent/25 bg-accent-strong/[0.06]'
                } ${n.linkPath ? 'hover:border-line-strong' : ''}`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.read ? 'bg-transparent' : 'bg-accent'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{n.title}</span>
                    <span className="shrink-0 text-xs text-faint">
                      {formatRelativeDate(n.createdAt)}
                    </span>
                  </div>
                  {n.body && <p className="mt-0.5 truncate text-sm text-muted">{n.body}</p>}
                </div>
              </div>
            )
            return (
              <li key={n.id}>
                {n.linkPath ? (
                  <Link href={n.linkPath} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
