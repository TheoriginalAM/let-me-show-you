import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  findMovedBookingLink,
  getBookingByToken,
  getPublicEventType,
  hostBusy,
  slotRules,
} from '@/db/bookings'
import { availableSlots, bookingHorizon, formatDuration } from '@/lib/booking-time'
import { BrandedPage, BrandHeader, PoweredBy } from '../../brand-header'
import { Scheduler } from './scheduler'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ business: string; event: string }>
  searchParams: Promise<{ reschedule?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { business, event } = await params
  const ev = await getPublicEventType(business, event)
  if (!ev) return { title: { absolute: 'Booking page not found' }, robots: { index: false } }
  const name = ev.business.brand.name || ev.business.workspaceName
  const title = `${ev.title} with ${name}`
  const description =
    ev.description?.slice(0, 160) ||
    `Book a ${formatDuration(ev.durationMinutes)} video call with ${name}.`
  const images = ev.business.brand.coverUrl ? [{ url: ev.business.brand.coverUrl }] : undefined
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/book/${business}/${event}`,
      siteName: name,
      images,
    },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description },
  }
}

export default async function EventBookingPage({ params, searchParams }: PageProps) {
  const { business, event } = await params
  const { reschedule } = await searchParams
  const ev = await getPublicEventType(business, event)
  if (!ev) {
    // A renamed calendar (or page) link keeps working.
    const moved = await findMovedBookingLink(business, event)
    if (moved?.event)
      redirect(
        `/book/${moved.business}/${moved.event}${reschedule ? `?reschedule=${encodeURIComponent(reschedule)}` : ''}`,
      )
    notFound()
  }

  // A guest moving their booking: its current time counts as free.
  let moving: { token: string; name: string; email: string; startsAt: string } | null = null
  let movingId: string | undefined
  if (reschedule) {
    const b = await getBookingByToken(reschedule)
    if (
      b &&
      b.status === 'confirmed' &&
      b.eventTypeId === ev.id &&
      new Date(b.startsAt).getTime() > Date.now()
    ) {
      moving = { token: reschedule, name: b.guestName, email: b.guestEmail, startsAt: b.startsAt }
      movingId = b.id
    }
  }

  // Open the calendar on the month of the first free time.
  const now = Date.now()
  const rules = slotRules(ev)
  const horizon = bookingHorizon(rules, now)
  const busy = await hostBusy(ev.hostUserId, now, horizon, { ignoreBookingId: movingId })
  const first = availableSlots(rules, busy, now, horizon, now)[0] ?? null
  const { brand } = ev.business

  return (
    <BrandedPage brand={brand} accent={ev.color} className="flex flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <BrandHeader brand={brand} fallbackName={ev.business.workspaceName} />
        <Link
          href={`/book/${ev.business.slug}`}
          className="self-start text-sm text-muted transition hover:text-ink"
        >
          ‹ Everything you can book
        </Link>
        <Scheduler
          businessSlug={ev.business.slug}
          eventSlug={ev.slug}
          title={ev.title}
          description={ev.description}
          durationMinutes={ev.durationMinutes}
          hostName={ev.hostName}
          hostPhoto={brand.photoUrl}
          hostTimeZone={ev.timeZone}
          firstSlot={first === null ? null : new Date(first).toISOString()}
          questions={ev.questions}
          reschedule={moving}
        />
        <PoweredBy />
      </div>
    </BrandedPage>
  )
}
