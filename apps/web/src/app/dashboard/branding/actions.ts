'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/current-user'
import { getActiveWorkspaceId, setWorkspaceBrand, type WorkspaceBrand } from '@/db/workspaces'

type Result = { ok: boolean; error?: string }

const HEX = /^#[0-9a-fA-F]{6}$/
// A resized logo data URL should be well under this; guards the TEXT column.
const MAX_LOGO_CHARS = 400_000
const LOGO_SIZES = ['small', 'medium', 'large']

/** Normalize a CTA URL: only http(s), else null. */
function cleanUrl(raw: string | null): string | null {
  if (!raw) return null
  let value = raw.trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    const u = new URL(value)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString().slice(0, 400)
  } catch {
    return null
  }
}

/** Save (or clear) the active workspace's share-page branding. Owner-only. */
export async function saveBrandAction(input: WorkspaceBrand): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  if (!user.approved) return { ok: false, error: 'Your account is pending approval.' }

  const name = input.name && input.name.trim() ? input.name.trim().slice(0, 60) : null
  const color = input.color && HEX.test(input.color) ? input.color : null
  const tagline = input.tagline && input.tagline.trim() ? input.tagline.trim().slice(0, 120) : null
  const logoSize =
    input.logoSize && LOGO_SIZES.includes(input.logoSize) ? input.logoSize : null
  const ctaUrl = cleanUrl(input.ctaUrl)
  // A CTA label only makes sense with a URL; drop it otherwise.
  const ctaLabel =
    ctaUrl && input.ctaLabel && input.ctaLabel.trim() ? input.ctaLabel.trim().slice(0, 40) : null

  let logo: string | null = null
  if (input.logo) {
    if (!input.logo.startsWith('data:image/')) {
      return { ok: false, error: 'Logo must be an image.' }
    }
    if (input.logo.length > MAX_LOGO_CHARS) {
      return { ok: false, error: 'Logo is too large. Try a simpler image.' }
    }
    logo = input.logo
  }

  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, error: 'No active workspace.' }
  const ok = await setWorkspaceBrand(user.id, workspaceId, {
    name,
    logo,
    color,
    tagline,
    logoSize,
    ctaLabel,
    ctaUrl,
  })
  if (!ok) return { ok: false, error: 'Only a workspace owner can edit branding.' }
  revalidatePath('/dashboard/workspace')
  revalidatePath('/dashboard')
  return { ok: true }
}
