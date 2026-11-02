import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { APP_DOMAIN } from '@lmsy/shared'
import { ensureDefaultRoom, listStandingRoomsForWorkspace } from '@/db/meetings'
import { getActiveWorkspaceId, getWorkspaceForMember } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { meetingsConfigured } from '@/lib/livekit'
import { reconcileWorkspaceRecordings } from '@/lib/meeting-recording'
import { RoomsManager } from './rooms-manager'
import { PageHeader } from '../page-header'

export const metadata: Metadata = { title: 'Meeting rooms' }

export const dynamic = 'force-dynamic'

export default async function RoomsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.approved) redirect('/pending')

  const workspaceId = await getActiveWorkspaceId(user.id)
  const ws = workspaceId ? await getWorkspaceForMember(user.id, workspaceId) : null
  if (!workspaceId || !ws) redirect('/dashboard')

  const configured = meetingsConfigured()
  // Tidy up any recording that ended without a Stop (everyone left, etc.).
  if (configured) await reconcileWorkspaceRecordings(workspaceId)
  await ensureDefaultRoom(user.id, workspaceId, ws.name)
  const rooms = await listStandingRoomsForWorkspace(workspaceId)

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        section="meetings"
        title="Meeting rooms"
        description={
          <>
            Video calls for{' '}
            <span className="font-semibold text-ink">{ws.brand.name || ws.name}</span>. Share a
            room&rsquo;s link and clients join in their browser, in your colours. Anyone in this
            business can host.
          </>
        }
      />

      {!configured && (
        <div className="rounded-2xl border-2 border-hl-orange bg-hl-orange/10 p-5 text-sm text-ink">
          Meetings aren't switched on yet. Rooms work as soon as the LiveKit keys are added to the
          server.
        </div>
      )}

      <RoomsManager
        domain={APP_DOMAIN}
        brand={{ name: ws.brand.name || ws.name, logo: ws.brand.logo, color: ws.brand.color }}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          lobbyEnabled: r.lobbyEnabled,
          welcomeMessage: r.welcomeMessage,
          accentColor: r.accentColor,
          background: r.background,
          backgroundImageUrl: r.backgroundImageUrl,
        }))}
      />
    </div>
  )
}
