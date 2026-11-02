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
import { PageHeader } from '../page-header'

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
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        section="booking"
        title="Booking"
        description={
          <>
            Let clients of{' '}
            <span className="font-semibold text-ink">{ws.brand.name || ws.name}</span> pick a time
            with you. Each booking gets its own private room and a calendar invite, and a time
            booked in any of your businesses is blocked in all of them.
          </>
        }
      />

      <BookingManager
        domain={APP_DOMAIN}
        pageSlug={slug}
        isOwner={ws.role === 'owner'}
        accent={ws.brand.color}
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
          questions: e.questions,
          confirmationMessage: e.confirmationMessage,
          remindersEnabled: e.remindersEnabled,
          color: e.color,
          active: e.active,
          hostUserId: e.hostUserId,
          hostName: e.hostName,
        }))}
        upcoming={upcoming}
        past={past}
        timeOff={timeOff}
      />
    </div>
  )
}
