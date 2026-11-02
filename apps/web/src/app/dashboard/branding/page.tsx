import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ensureBookingSlug, listEventTypesForWorkspace } from '@/db/bookings'
import { getActiveWorkspaceId, getWorkspaceForMember } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { PageHeader } from '../page-header'
import { BrandingForm } from './branding-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Branding' }

export default async function BrandingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const workspaceId = await getActiveWorkspaceId(user.id)
  const ws = workspaceId ? await getWorkspaceForMember(user.id, workspaceId) : null
  // Branding is the owner's call; members manage recordings, rooms and bookings.
  if (!ws || ws.role !== 'owner') redirect('/dashboard')

  const [slug, eventTypes] = await Promise.all([
    ensureBookingSlug(ws.id),
    listEventTypesForWorkspace(ws.id),
  ])

  return (
    <div className="flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        section="branding"
        title="Branding"
        description={
          <>
            How <span className="font-semibold text-ink">{ws.brand.name || ws.name}</span> looks to
            clients: your booking page, meeting rooms, shared videos and emails. Let Me Show You
            stays in the background.
          </>
        }
      />
      <BrandingForm
        initial={ws.brand}
        fallbackName={ws.name}
        calendars={eventTypes.filter((e) => e.active).map((e) => e.title)}
        bookingUrl={`/book/${slug}`}
      />
    </div>
  )
}
