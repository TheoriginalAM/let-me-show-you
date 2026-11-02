import { NextResponse } from 'next/server'
import { getAuthedUserId } from '@/lib/api-auth'
import { appBaseUrl } from '@/lib/config'
import { listUpcomingBookingsForUser } from '@/db/bookings'
import { isUserApproved } from '@/db/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Upcoming bookings in every business the caller belongs to (desktop app's
 * Calendar tab, next-call menu item and 5-minute heads-up). `isMine` marks the
 * calls the caller hosts; the app only alerts for those.
 */
export async function GET(request: Request) {
  const userId = await getAuthedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isUserApproved(userId))) {
    return NextResponse.json({ error: 'Your account is pending approval.' }, { status: 403 })
  }
  const base = appBaseUrl()
  const rows = await listUpcomingBookingsForUser(userId)
  return NextResponse.json({
    bookings: rows.map((b) => ({
      id: b.id,
      title: b.title,
      startsAt: new Date(b.startsAt).toISOString(),
      endsAt: new Date(b.endsAt).toISOString(),
      guestName: b.guestName,
      guestEmail: b.guestEmail,
      notes: b.guestNotes,
      answers: b.answers,
      hostName: b.hostName,
      isMine: b.hostUserId === userId,
      businessName: b.businessName,
      joinUrl: b.roomSlug ? `${base}/m/${b.roomSlug}` : null,
    })),
    manageUrl: `${base}/dashboard/booking`,
  })
}
