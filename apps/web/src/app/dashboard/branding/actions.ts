'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/current-user'
import type { Brand } from '@/db/users'
import { getActiveWorkspaceId, setWorkspaceBrand } from '@/db/workspaces'

type Result = { ok: boolean; error?: string }

const HEX = /^#[0-9a-fA-F]{6}$/
// A resized logo data URL should be well under this; guards the TEXT column.
const MAX_LOGO_CHARS = 400_000

/** Save (or clear) the signed-in owner's share-page branding. */
export async function saveBrandAction(input: Brand): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  if (!user.approved) return { ok: false, error: 'Your account is pending approval.' }

  const name = input.name && input.name.trim() ? input.name.trim().slice(0, 60) : null
  const color = input.color && HEX.test(input.color) ? input.color : null

  let logo: string | null = null
  if (input.logo) {
    if (!input.logo.startsWith('data:image/')) {
      return { ok: false, error: 'Logo must be an image.' }
    }
    if (input.logo.length > MAX_LOGO_CHARS) {
      return { ok: false, error: 'Logo is too large — try a smaller image.' }
    }
    logo = input.logo
  }

  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, error: 'No active workspace.' }
  const ok = await setWorkspaceBrand(user.id, workspaceId, { name, logo, color })
  if (!ok) return { ok: false, error: 'Only a workspace owner can edit branding.' }
  revalidatePath('/dashboard/workspace')
  revalidatePath('/dashboard')
  return { ok: true }
}
