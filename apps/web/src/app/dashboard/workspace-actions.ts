'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/current-user'
import { createWorkspace, setActiveWorkspace } from '@/db/workspaces'

/** Switch the caller's active workspace (membership validated in the DAL). */
export async function switchWorkspaceAction(workspaceId: string): Promise<{ ok: boolean }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false }
  const ok = await setActiveWorkspace(me.id, workspaceId)
  if (ok) revalidatePath('/dashboard')
  return { ok }
}

/** Create a new workspace (owned by the caller) and make it active. */
export async function createWorkspaceAction(
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Not signed in.' }
  const clean = name.trim()
  if (!clean) return { ok: false, error: 'Enter a workspace name.' }
  const { id } = await createWorkspace(me.id, clean)
  revalidatePath('/dashboard')
  return { ok: true, id }
}
