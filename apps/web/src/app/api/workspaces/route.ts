import { NextResponse } from 'next/server'
import { getAuthedUserId } from '@/lib/api-auth'
import { isUserApproved } from '@/db/users'
import { getActiveWorkspaceId, listWorkspacesForUser } from '@/db/workspaces'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lists the caller's workspaces (for the desktop app's workspace picker). */
export async function GET(request: Request) {
  const userId = await getAuthedUserId(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isUserApproved(userId))) {
    return NextResponse.json({ error: 'Your account is pending approval.' }, { status: 403 })
  }
  // Resolve active first: it self-provisions a default workspace if the user has
  // none, so the subsequent list always includes at least one.
  const activeId = await getActiveWorkspaceId(userId)
  const workspaces = await listWorkspacesForUser(userId)
  return NextResponse.json({
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
    activeId,
  })
}
