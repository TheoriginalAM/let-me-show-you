import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBookingPage } from '@/db/bookings'
import { formatDuration } from '@/lib/booking-time'
import { BrandHeader, DEFAULT_ACCENT, PoweredBy } from '../brand-header'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ business: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { business } = await params
  const page = await getBookingPage(business)
  if (!page) return { title: { absolute: 'Booking page not found' }, robots: { index: false } }
  const name = page.business.brand.name || page.business.workspaceName
  const title = `Book a time with ${name}`
  const description = page.business.brand.tagline || `Pick a time that suits you for a video call with ${name}.`
  return {
    // White-labelled: no site-name suffix.
    title: { absolute: title },
    description,
    openGraph: { type: 'website', title, description, url: `/book/${page.business.slug}`, siteName: name },
    twitter: { card: 'summary', title, description },
  }
}

export default async function BusinessBookingPage({ params }: PageProps) {
  const { business } = await params
  const page = await getBookingPage(business)
  if (!page) notFound()
  const { brand } = page.business
  const accent = brand.color ?? DEFAULT_ACCENT
  const name = brand.name || page.business.workspaceName

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-10">
      <BrandHeader brand={brand} fallbackName={page.business.workspaceName} />
      <header className="rise">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Book a time</h1>
        <p className="mt-2 text-muted">
          Choose what you&rsquo;d like to book with {name}. Calls run in your browser, so there&rsquo;s
          nothing to install.
        </p>
      </header>

      {page.eventTypes.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-muted">
          There&rsquo;s nothing to book right now. Please check back soon.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {page.eventTypes.map((e) => (
            <li key={e.id}>
              <Link
                href={`/book/${page.business.slug}/${e.slug}`}
                className="glass glass-hover rise flex h-full flex-col gap-2 rounded-2xl p-5"
                style={{ borderLeft: `3px solid ${accent}` }}
              >
                <span className="font-display text-lg font-semibold tracking-tight text-ink">{e.title}</span>
                <span className="text-sm text-muted">
                  {formatDuration(e.durationMinutes)} &middot; video call with {e.hostName}
                </span>
                {e.description && <span className="line-clamp-3 text-sm text-faint">{e.description}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <PoweredBy />
    </main>
  )
}
