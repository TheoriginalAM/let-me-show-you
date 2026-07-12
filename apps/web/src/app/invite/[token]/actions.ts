'use server'

import { getCurrentUser } from '@/lib/current-user'
import { acceptInvite } from '@/db/workspaces'

/** Accept a workspace invite as the signed-in user (email must match the invite). */
export async function acceptInviteAction(
  token: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Please sign in to accept this invite.' }
  return acceptInvite(token, me.id, me.email)
}
