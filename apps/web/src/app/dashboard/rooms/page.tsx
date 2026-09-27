import Link from 'next/link'
import { redirect } from 'next/navigation'
import { APP_DOMAIN } from '@lmsy/shared'
import { ensureDefaultRoom, listRoomsForWorkspace } from '@/db/meetings'
import { getActiveWorkspaceId, getWorkspaceForMember } from '@/db/workspaces'
import { getCurrentUser } from '@/lib/current-user'
import { meetingsConfigured } from '@/lib/livekit'
import { reconcileWorkspaceRecordings } from '@/lib/meeting-recording'
import { RoomsManager } from './rooms-manager'

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
  const rooms = await listRoomsForWorkspace(workspaceId)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="rise flex flex-col gap-2">
        <Link href="/dashboard" className="text-sm text-faint transition hover:text-ink">
          ← Back to recordings
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Meeting rooms
        </h1>
        <p className="max-w-2xl text-muted">
          Live video calls for <span className="text-ink">{ws.name}</span>. Share a room link and
          clients join in their browser, with your branding. Anyone in this workspace can host, and
          recordings land here alongside your other videos.
        </p>
      </header>

      {!configured && (
        <div className="glass rounded-2xl border-amber-500/30 p-5 text-sm text-amber-200">
          Meetings aren't switched on yet. Rooms work as soon as the LiveKit keys are added to the
          server.
        </div>
      )}

      <RoomsManager
        domain={APP_DOMAIN}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          lobbyEnabled: r.lobbyEnabled,
        }))}
      />
    </main>
  )
}
