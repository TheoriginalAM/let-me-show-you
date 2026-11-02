import { NextResponse } from 'next/server'
import { getAuthedUserId } from '@/lib/api-auth'
import { appBaseUrl } from '@/lib/config'
import { listStandingRoomsForWorkspace } from '@/db/meetings'
import { isUserApproved } from '@/db/users'
import { getWorkspaceForMember, listWorkspacesForUser } from '@/db/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The caller's meeting rooms in every business they belong to (desktop app's Meetings tab). */
export async function GET(request: Request) {
  const userId = await getAuthedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isUserApproved(userId))) {
    return NextResponse.json({ error: 'Your account is pending approval.' }, { status: 403 })
  }
  const base = appBaseUrl()
  const workspaces = await listWorkspacesForUser(userId)
  const groups = await Promise.all(
    workspaces.map(async (w) => {
      const [meta, rooms] = await Promise.all([
        getWorkspaceForMember(userId, w.id),
        listStandingRoomsForWorkspace(w.id),
      ])
      const businessName = meta?.brand.name || w.name
      return rooms.map((r) => ({
        id: r.id,
        name: r.name,
        url: `${base}/m/${r.slug}`,
        businessName,
        lobbyEnabled: r.lobbyEnabled,
      }))
    }),
  )
  return NextResponse.json({ rooms: groups.flat(), manageUrl: `${base}/dashboard/rooms` })
}
