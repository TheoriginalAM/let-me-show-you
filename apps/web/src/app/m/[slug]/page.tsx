import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { getRoomBySlug } from '@/db/meetings'
import { memberRole } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { meetingsConfigured } from '@/lib/livekit'
import { reconcileRoomRecordings } from '@/lib/meeting-recording'
import { MeetingRoom } from './meeting-room'

// Reads the session + room per request.
export const dynamic = 'force-dynamic'

const DEFAULT_ACCENT = '#8b8bf6' // luminous violet: the default brand accent

type PageProps = { params: Promise<{ slug: string }> }

// Let the call use the full screen on phones (safe-area insets are handled in CSS).
export const viewport: Viewport = { viewportFit: 'cover', themeColor: '#08080c' }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const room = await getRoomBySlug(slug)
  return {
    // Absolute: rooms are white-labelled, so no site-name suffix.
    title: { absolute: room ? `Join ${room.name}` : 'Meeting not found' },
    // Room links are private invitations: never index them.
    robots: { index: false, follow: false },
  }
}

export default async function MeetingPage({ params }: PageProps) {
  const { slug } = await params
  const room = await getRoomBySlug(slug)
  if (!room) notFound()

  const configured = meetingsConfigured()
  const me = await getCurrentUser()
  const isHost = Boolean(me?.approved && (await memberRole(me.id, room.workspaceId)))
  // Cheap self-heal of any recording left mid-flight (one indexed query if idle).
  if (isHost && configured) await reconcileRoomRecordings(room.id)

  return (
    <MeetingRoom
      slug={room.slug}
      roomName={room.name}
      brand={{
        name: room.brand.name || room.workspaceName,
        logo: room.brand.logo,
        accent: room.brand.color || DEFAULT_ACCENT,
      }}
      isHost={isHost}
      lobbyEnabled={room.lobbyEnabled}
      me={me ? { name: me.name, email: me.email } : null}
      configured={configured}
    />
  )
}
