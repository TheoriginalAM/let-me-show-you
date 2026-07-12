'use server'

import { revalidatePath } from 'next/cache'
import { APP_DOMAIN } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { notifyWorkspaceInvite } from '@/lib/notifications'
import {
  createInvite,
  deleteWorkspace,
  getActiveWorkspaceId,
  getWorkspaceForMember,
  removeMember,
  renameWorkspace,
  revokeInvite,
} from '@/db/workspaces'

type Result = { ok: boolean; error?: string }

/** Resolve the caller + their active workspace id, or null if not signed in. */
async function context(): Promise<{ userId: string; userName: string; workspaceId: string } | null> {
  const me = await getCurrentUser()
  if (!me) return null
  const workspaceId = await getActiveWorkspaceId(me.id)
  if (!workspaceId) return null
  return { userId: me.id, userName: me.name, workspaceId }
}

export async function renameWorkspaceAction(name: string): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const ok = await renameWorkspace(ctx.userId, ctx.workspaceId, name)
  if (!ok) return { ok: false, error: 'Could not rename (owners only).' }
  revalidatePath('/dashboard/workspace')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function inviteMemberAction(email: string, role: 'owner' | 'member'): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const res = await createInvite(ctx.userId, ctx.workspaceId, email, role === 'owner' ? 'owner' : 'member')
  if ('error' in res) return { ok: false, error: res.error }

  // Send the invite email (best-effort; never fails the action).
  const ws = await getWorkspaceForMember(ctx.userId, ctx.workspaceId)
  void notifyWorkspaceInvite({
    email: email.trim().toLowerCase(),
    workspaceName: ws?.name ?? 'a workspace',
    inviterName: ctx.userName,
    url: `https://${APP_DOMAIN}/invite/${res.token}`,
  }).catch((error) => console.error('[workspace] invite email failed:', error))

  revalidatePath('/dashboard/workspace')
  return { ok: true }
}

export async function removeMemberAction(memberUserId: string): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const ok = await removeMember(ctx.userId, ctx.workspaceId, memberUserId)
  if (!ok) return { ok: false, error: 'Could not remove this member.' }
  revalidatePath('/dashboard/workspace')
  return { ok: true }
}

export async function revokeInviteAction(inviteId: string): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const ok = await revokeInvite(ctx.userId, ctx.workspaceId, inviteId)
  if (!ok) return { ok: false, error: 'Could not revoke.' }
  revalidatePath('/dashboard/workspace')
  return { ok: true }
}

export async function deleteWorkspaceAction(): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const ok = await deleteWorkspace(ctx.userId, ctx.workspaceId)
  if (!ok) {
    return { ok: false, error: "Can't delete your only workspace (owners only)." }
  }
  revalidatePath('/dashboard')
  return { ok: true }
}
