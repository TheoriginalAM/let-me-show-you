'use server'

import { revalidatePath } from 'next/cache'
import { brandFont, brandTheme, cleanHex } from '@/lib/brand-theme'
import { getCurrentUser } from '@/lib/current-user'
import { getActiveWorkspaceId, setWorkspaceBrand } from '@/db/workspaces'

type Result = { ok: boolean; error?: string }

const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
// Resized client-side; these guard the TEXT columns.
const MAX_LOGO_CHARS = 400_000
const MAX_COVER_CHARS = 900_000
const MAX_PHOTO_CHARS = 300_000
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

function text(value: unknown, max: number): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s ? s.slice(0, max) : null
}

/** undefined = keep, null = remove, else a checked data URL. */
function image(
  value: unknown,
  max: number,
  label: string,
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null || value === '') return { ok: true, value: null }
  if (typeof value !== 'string' || !IMAGE_DATA_URL.test(value))
    return { ok: false, error: `${label} must be a PNG, JPEG or WebP image.` }
  if (value.length > max) return { ok: false, error: `${label} is too large. Try a smaller image.` }
  return { ok: true, value }
}

export interface SaveBrandInput {
  name: string | null
  tagline: string | null
  logo: string | null
  logoSize: string | null
  color: string | null
  theme: string | null
  font: string | null
  ctaLabel: string | null
  ctaUrl: string | null
  bio: string | null
  cover?: string | null
  photo?: string | null
}

/** Save the active business's branding. Owner-only. */
export async function saveBrandAction(input: SaveBrandInput): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (!user.approved) return { ok: false, error: 'Your account is pending approval.' }

  const ctaUrl = cleanUrl(input.ctaUrl)
  const logo = image(input.logo, MAX_LOGO_CHARS, 'The logo')
  const cover = image(input.cover, MAX_COVER_CHARS, 'The cover photo')
  const photo = image(input.photo, MAX_PHOTO_CHARS, 'Your photo')
  for (const r of [logo, cover, photo]) if (!r.ok) return { ok: false, error: r.error }

  const workspaceId = await getActiveWorkspaceId(user.id)
  if (!workspaceId) return { ok: false, error: 'No active business.' }
  const ok = await setWorkspaceBrand(user.id, workspaceId, {
    name: text(input.name, 60),
    tagline: text(input.tagline, 120),
    logo: (logo.ok && logo.value) || null,
    logoSize: input.logoSize && LOGO_SIZES.includes(input.logoSize) ? input.logoSize : null,
    color: cleanHex(input.color),
    theme: brandTheme(input.theme),
    font: brandFont(input.font),
    // A button label only makes sense with somewhere to go.
    ctaLabel: ctaUrl ? text(input.ctaLabel, 40) : null,
    ctaUrl,
    bio: text(input.bio, 600),
    cover: cover.ok ? cover.value : undefined,
    photo: photo.ok ? photo.value : undefined,
  })
  if (!ok) return { ok: false, error: 'Only the business owner can change its branding.' }
  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}
