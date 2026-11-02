import { getBookingByToken } from '@/db/bookings'
import { bookingIcs } from '@/lib/booking-emails'

export const dynamic = 'force-dynamic'

/** The booking as a calendar file (Apple Calendar, Outlook, etc.). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const b = await getBookingByToken(token)
  if (!b) return new Response('Not found', { status: 404 })
  return new Response(bookingIcs(b, b.status === 'confirmed' ? 'REQUEST' : 'CANCEL'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="booking.ics"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
