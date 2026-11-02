import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { findMovedBookingLink, getBookingPage } from '@/db/bookings'
import { onColor } from '@/lib/brand-theme'
import { formatDuration } from '@/lib/booking-time'
import { BrandedPage, BrandHero, PoweredBy } from '../brand-header'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ business: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { business } = await params
  const page = await getBookingPage(business)
  if (!page) return { title: { absolute: 'Booking page not found' }, robots: { index: false } }
  const name = page.business.brand.name || page.business.workspaceName
  const title = `Book a time with ${name}`
  const description =
    page.business.brand.tagline || `Pick a time that suits you for a video call with ${name}.`
  const images = page.business.brand.coverUrl ? [{ url: page.business.brand.coverUrl }] : undefined
  return {
    // White-labelled: no site-name suffix.
    title: { absolute: title },
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/book/${page.business.slug}`,
      siteName: name,
      images,
    },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description },
  }
}

export default async function BusinessBookingPage({ params }: PageProps) {
  const { business } = await params
  const page = await getBookingPage(business)
  if (!page) {
    // A renamed page link keeps working.
    const moved = await findMovedBookingLink(business)
    if (moved) redirect(`/book/${moved.business}`)
    notFound()
  }
  const { brand } = page.business
  const name = brand.name || page.business.workspaceName

  return (
    <BrandedPage brand={brand} className="flex flex-col">
      <div className="mx-auto w-full max-w-5xl sm:px-6 sm:pt-6">
        <BrandHero brand={brand} fallbackName={page.business.workspaceName} />
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 pt-10 sm:px-8">
        <h2 className="font-brand text-xl font-bold tracking-tight text-ink">
          {page.eventTypes.length > 1 ? 'Pick what you’d like to book' : 'Book a time'}
        </h2>
        {page.eventTypes.length === 0 ? (
          <div className="card rounded-2xl p-8 text-center text-muted">
            {name} isn&rsquo;t taking bookings online right now. Check back soon.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {page.eventTypes.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/book/${page.business.slug}/${e.slug}`}
                  className="card group relative flex items-center gap-4 overflow-hidden rounded-2xl p-5 pl-6 transition hover:border-line-strong"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1.5"
                    style={{ background: e.color ?? 'var(--color-accent)' }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-brand text-lg font-bold tracking-tight text-ink">
                      {e.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {formatDuration(e.durationMinutes)} video call with {e.hostName}
                    </span>
                    {e.description && (
                      <span className="mt-2 line-clamp-2 block text-sm leading-relaxed text-faint">
                        {e.description}
                      </span>
                    )}
                  </span>
                  <span
                    className="hidden shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition group-hover:-translate-y-0.5 sm:inline-block"
                    style={{
                      background: e.color ?? 'var(--color-accent)',
                      color: e.color ? onColor(e.color) : 'var(--color-on-accent)',
                    }}
                  >
                    Pick a time
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-faint">
          Calls run in your browser. There&rsquo;s nothing to install.
        </p>
      </main>
      <PoweredBy />
    </BrandedPage>
  )
}
