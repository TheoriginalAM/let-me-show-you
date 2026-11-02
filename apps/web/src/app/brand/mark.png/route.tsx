import { ImageResponse } from 'next/og'
import { MARK_SVG } from '@/components/brand/mark-svg'

// The logo mark as a PNG, for emails (most email apps can't show SVG).
export const dynamic = 'force-static'

export function GET() {
  const src = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={120} height={120} alt="" />,
    { width: 120, height: 120 },
  )
}
