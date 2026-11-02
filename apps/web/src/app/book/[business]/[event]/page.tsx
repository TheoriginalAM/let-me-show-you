import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBookingByToken, getPublicEventType, hostBusy, slotRules } from '@/db/bookings'
import { availableSlots, bookingHorizon, formatDuration } from '@/lib/booking-time'
import { BrandHeader, DEFAULT_ACCENT, PoweredBy } from '../../brand-header'
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
    ev.description?.slice(0, 160) || `Book a ${formatDuration(ev.durationMinutes)} video call with ${name}.`
  return {
    title: { absolute: title },
    description,
    openGraph: { type: 'website', title, description, url: `/book/${business}/${event}`, siteName: name },
    twitter: { card: 'summary', title, description },
  }
}

export default async function EventBookingPage({ params, searchParams }: PageProps) {
  const { business, event } = await params
  const { reschedule } = await searchParams
  const ev = await getPublicEventType(business, event)
  if (!ev) notFound()

  // A guest moving their booking: its current time counts as free.
  let moving: { token: string; name: string; email: string; startsAt: string } | null = null
  let movingId: string | undefined
  if (reschedule) {
    const b = await getBookingByToken(reschedule)
    if (b && b.status === 'confirmed' && b.eventTypeId === ev.id && new Date(b.startsAt).getTime() > Date.now()) {
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
  const accent = ev.business.brand.color ?? DEFAULT_ACCENT

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <BrandHeader brand={ev.business.brand} fallbackName={ev.business.workspaceName} />
      <Link href={`/book/${ev.business.slug}`} className="text-sm text-faint transition hover:text-ink">
        ← All booking options
      </Link>
      <Scheduler
        businessSlug={ev.business.slug}
        eventSlug={ev.slug}
        title={ev.title}
        description={ev.description}
        durationMinutes={ev.durationMinutes}
        hostName={ev.hostName}
        hostTimeZone={ev.timeZone}
        firstSlot={first === null ? null : new Date(first).toISOString()}
        accent={accent}
        reschedule={moving}
      />
      <PoweredBy />
    </main>
  )
}
