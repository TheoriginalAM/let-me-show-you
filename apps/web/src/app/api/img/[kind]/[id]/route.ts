import { roomBackgroundImage } from '@/db/meetings'
import { workspaceImage } from '@/db/workspaces'

// Branding photos are stored as data URLs; this serves them as real images so
// pages can link to them (cached for good: the URL's ?v= changes with the photo).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params
  if (!UUID_RE.test(id)) return new Response('Not found', { status: 404 })
  const data =
    kind === 'cover' || kind === 'photo' || kind === 'logo'
      ? await workspaceImage(id, kind)
      : kind === 'room'
        ? await roomBackgroundImage(id)
        : null
  const m = data ? DATA_URL_RE.exec(data) : null
  if (!m) return new Response('Not found', { status: 404 })
  return new Response(Buffer.from(m[2]!, 'base64'), {
    headers: {
      'Content-Type': m[1]!,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
