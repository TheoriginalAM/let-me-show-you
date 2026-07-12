import Link from 'next/link'
import { unreadNotificationCount } from '@/db/app-notifications'

/** Header bell linking to the notifications inbox, with an unread-count badge. */
export async function NotificationsBell({ userId }: { userId: string }) {
  const unread = await unreadNotificationCount(userId)
  return (
    <Link
      href="/dashboard/notifications"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
      className="btn-ghost relative px-2.5 py-1.5"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4.5 w-4.5"
        style={{ width: 18, height: 18 }}
        aria-hidden
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-accent-strong px-1 text-[10px] font-bold text-white ring-2 ring-canvas">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}
