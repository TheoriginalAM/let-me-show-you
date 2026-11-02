'use server'

import { revalidatePath } from 'next/cache'
import { APP_DOMAIN } from '@lmsy/shared'
import { getCurrentUser } from '@/lib/current-user'
import { shutdownWorkspaceMeetings } from '@/lib/meeting-recording'
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
async function context(): Promise<{
  userId: string
  userName: string
  workspaceId: string
} | null> {
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
  if (!ok) return { ok: false, error: 'Only owners can rename the business.' }
  revalidatePath('/dashboard/workspace')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function inviteMemberAction(
  email: string,
  role: 'owner' | 'member',
): Promise<{ ok: false; error: string } | { ok: true; url: string; emailed: boolean }> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const res = await createInvite(
    ctx.userId,
    ctx.workspaceId,
    email,
    role === 'owner' ? 'owner' : 'member',
  )
  if ('error' in res) return { ok: false, error: res.error }

  const url = `https://${APP_DOMAIN}/invite/${res.token}`
  const ws = await getWorkspaceForMember(ctx.userId, ctx.workspaceId)
  // Await the email so it actually sends (a fire-and-forget promise after the
  // action returns was not completing). The invite link is returned regardless,
  // so the owner can always share it manually if delivery fails.
  let emailed = false
  try {
    emailed = await notifyWorkspaceInvite({
      email: email.trim().toLowerCase(),
      workspaceName: ws?.name ?? 'a business',
      inviterName: ctx.userName,
      url,
    })
  } catch (error) {
    console.error('[workspace] invite email failed:', error)
  }

  revalidatePath('/dashboard/workspace')
  return { ok: true, url, emailed }
}

export async function removeMemberAction(memberUserId: string): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const ok = await removeMember(ctx.userId, ctx.workspaceId, memberUserId)
  if (!ok)
    return {
      ok: false,
      error:
        "Couldn't remove them. Only owners can remove people, and a business needs at least one owner.",
    }
  revalidatePath('/dashboard/workspace')
  return { ok: true }
}

export async function revokeInviteAction(inviteId: string): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const ok = await revokeInvite(ctx.userId, ctx.workspaceId, inviteId)
  if (!ok) return { ok: false, error: 'Only owners can revoke invites.' }
  revalidatePath('/dashboard/workspace')
  return { ok: true }
}

export async function deleteWorkspaceAction(): Promise<Result> {
  const ctx = await context()
  if (!ctx) return { ok: false, error: 'Not signed in.' }
  const workspaceId = ctx.workspaceId
  const ok = await deleteWorkspace(ctx.userId, workspaceId, () =>
    shutdownWorkspaceMeetings(workspaceId),
  )
  if (!ok) {
    return {
      ok: false,
      error:
        "Couldn't delete the business. Only owners can delete one, and you need to keep at least one business.",
    }
  }
  revalidatePath('/dashboard')
  return { ok: true }
}
