import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import { findMovedRoom, getRoomBySlug } from '@/db/meetings'
import { memberRole } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { DEFAULT_ACCENT } from '@/lib/brand-theme'
import { meetingsConfigured } from '@/lib/livekit'
import { reconcileRoomRecordings } from '@/lib/meeting-recording'
import { roomBackgroundCss } from '@/lib/room-backgrounds'
import { MeetingRoom } from './meeting-room'

// Reads the session + room per request.
export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ slug: string }> }

// Let the call use the full screen on phones (safe-area insets are handled in CSS).
export const viewport: Viewport = { viewportFit: 'cover', themeColor: '#12101f' }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const room = await getRoomBySlug(slug)
  if (!room) {
    return { title: { absolute: 'Meeting not found' }, robots: { index: false, follow: false } }
  }
  // White-labelled: a link pasted into WhatsApp, Slack or iMessage previews as
  // this room and brand, not the Let Me Show You marketing card (these replace
  // the site-wide Open Graph tags, image included).
  const title = `Join ${room.name}`
  const description = `Video call with ${room.brand.name || room.workspaceName}. Nothing to install.`
  return {
    // Absolute: rooms are white-labelled, so no site-name suffix.
    title: { absolute: title },
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      url: `/m/${room.slug}`,
      siteName: room.brand.name || room.workspaceName,
    },
    twitter: { card: 'summary', title, description },
    // Room links are private invitations: never index them.
    robots: { index: false, follow: false },
  }
}

export default async function MeetingPage({ params }: PageProps) {
  const { slug } = await params
  const room = await getRoomBySlug(slug)
  if (!room) {
    // A renamed room's old link keeps working.
    const moved = await findMovedRoom(slug)
    if (moved) redirect(`/m/${moved}`)
    notFound()
  }

  const configured = meetingsConfigured()
  const me = await getCurrentUser()
  const isHost = Boolean(me?.approved && (await memberRole(me.id, room.workspaceId)))
  // Cheap self-heal of any recording left mid-flight (one indexed query if idle).
  if (isHost && configured) await reconcileRoomRecordings(room.id)

  // The call screen is always dark; the room's backdrop shows around the join screen.
  return (
    <div
      data-theme="dark"
      className="theme-root min-h-dvh"
      style={{ background: roomBackgroundCss(room.background, room.backgroundImageUrl) }}
    >
      <MeetingRoom
        slug={room.slug}
        roomName={room.name}
        brand={{
          name: room.brand.name || room.workspaceName,
          logo: room.brand.logo,
          accent: room.accentColor || room.brand.color || DEFAULT_ACCENT,
          welcome: room.welcomeMessage,
        }}
        isHost={isHost}
        lobbyEnabled={room.lobbyEnabled}
        me={me ? { name: me.name, email: me.email } : null}
        configured={configured}
      />
    </div>
  )
}
