import Link from 'next/link'
import { redirect } from 'next/navigation'
import { APP_DOMAIN } from '@lmsy/shared'
import {
  ensureBookingSlug,
  listBookingsForWorkspace,
  listEventTypesForWorkspace,
  listTimeOff,
} from '@/db/bookings'
import { getActiveWorkspaceId, getWorkspaceForMember } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { BookingManager } from './booking-manager'

export const dynamic = 'force-dynamic'

export default async function BookingDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const workspaceId = await getActiveWorkspaceId(user.id)
  const ws = workspaceId ? await getWorkspaceForMember(user.id, workspaceId) : null
  if (!workspaceId || !ws) redirect('/dashboard')

  const slug = await ensureBookingSlug(workspaceId)
  const [eventTypes, upcoming, past, timeOff] = await Promise.all([
    listEventTypesForWorkspace(workspaceId),
    listBookingsForWorkspace(workspaceId, 'upcoming'),
    listBookingsForWorkspace(workspaceId, 'past', 25),
    listTimeOff(user.id),
  ])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="rise flex flex-col gap-2">
        <Link href="/dashboard" className="text-sm text-faint transition hover:text-ink">
          ← Back to recordings
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Booking</h1>
        <p className="max-w-2xl text-muted">
          Let clients of <span className="text-ink">{ws.brand.name || ws.name}</span> book a video call
          with you. Each booking gets its own private meeting room and a calendar invite. Times you&rsquo;re
          booked in any of your workspaces are blocked everywhere. Switch workspace on the dashboard to set
          up another business.
        </p>
      </header>

      <BookingManager
        domain={APP_DOMAIN}
        pageSlug={slug}
        isOwner={ws.role === 'owner'}
        meId={user.id}
        eventTypes={eventTypes.map((e) => ({
          id: e.id,
          title: e.title,
          slug: e.slug,
          description: e.description,
          durationMinutes: e.durationMinutes,
          slotStepMinutes: e.slotStepMinutes,
          bufferBeforeMinutes: e.bufferBeforeMinutes,
          bufferAfterMinutes: e.bufferAfterMinutes,
          minNoticeMinutes: e.minNoticeMinutes,
          maxDaysAhead: e.maxDaysAhead,
          timeZone: e.timeZone,
          weeklyHours: e.weeklyHours,
          active: e.active,
          hostUserId: e.hostUserId,
          hostName: e.hostName,
        }))}
        upcoming={upcoming}
        past={past}
        timeOff={timeOff}
      />
    </main>
  )
}
