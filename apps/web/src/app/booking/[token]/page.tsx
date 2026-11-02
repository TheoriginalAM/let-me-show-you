import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getBookingByToken } from '@/db/bookings'
import { joinUrl, rebookUrl } from '@/lib/booking-emails'
import { googleCalendarUrl } from '@/lib/booking-ics'
import { BrandedPage, BrandHeader, PoweredBy } from '../../book/brand-header'
import { ManageBooking } from './manage-booking'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ token: string }> }

// A private link: never index or preview it as anything but generic.
export const metadata: Metadata = {
  title: { absolute: 'Your booking' },
  robots: { index: false, follow: false },
}

export default async function BookingPage({ params }: PageProps) {
  const { token } = await params
  const b = await getBookingByToken(token)
  if (!b) notFound()
  const name = b.business.brand.name || b.business.workspaceName
  const start = new Date(b.startsAt).getTime()
  const end = new Date(b.endsAt).getTime()

  return (
    <BrandedPage brand={b.business.brand}>
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <BrandHeader brand={b.business.brand} fallbackName={b.business.workspaceName} />
        <ManageBooking
          token={token}
          businessName={name}
          hostPhoto={b.business.brand.photoUrl}
          message={b.confirmationMessage}
          answers={b.answers}
          title={b.title}
          hostName={b.hostName}
          guestName={b.guestName}
          guestEmail={b.guestEmail}
          startsAt={start}
          endsAt={end}
          savedTimeZone={b.guestTimeZone ?? b.eventTimeZone ?? 'Australia/Sydney'}
          status={b.status as 'confirmed' | 'cancelled'}
          rescheduled={b.cancelReason === 'Rescheduled'}
          joinUrl={b.roomSlug ? joinUrl(b) : null}
          googleUrl={googleCalendarUrl({
            start,
            end,
            title: `${b.title} with ${name}`,
            description: `Join the video call: ${joinUrl(b)}`,
            url: joinUrl(b),
          })}
          rescheduleUrl={
            b.business.slug && b.eventSlug
              ? `/book/${b.business.slug}/${b.eventSlug}?reschedule=${token}`
              : null
          }
          rebookUrl={rebookUrl(b)}
        />
        <PoweredBy />
      </main>
    </BrandedPage>
  )
}
