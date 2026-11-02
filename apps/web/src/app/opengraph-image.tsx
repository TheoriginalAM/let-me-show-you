import { ImageResponse } from 'next/og'
import { APP_NAME } from '@lmsy/shared'
import { MARK_SVG } from '@/components/brand/mark-svg'

export const alt = `${APP_NAME}: show, don't tell`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** The brand's display face for the card (falls back to the default if Google Fonts is unreachable). */
async function displayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch('https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@125,900&display=swap')
    ).text()
    const url = /src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/.exec(css)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch {
    return null
  }
}

export default async function OpenGraphImage() {
  const font = await displayFont()
  const mark = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#f4f3fb',
        padding: 72,
        position: 'relative',
      }}
    >
      <svg
        width="720"
        height="230"
        viewBox="0 0 200 80"
        style={{ position: 'absolute', left: 30, top: 150 }}
      >
        <path
          d="M60 8C24 10 5 26 8 44c4 22 55 32 102 29 46-3 83-17 82-37C190 14 146 3 98 5 70 6 44 12 30 20"
          stroke="#ffe14a"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={64} height={64} alt="" />
          <span
            style={{
              fontSize: 34,
              fontWeight: 900,
              color: '#17132b',
              fontFamily: font ? 'Anybody' : undefined,
            }}
          >
            {APP_NAME}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 150,
            lineHeight: 0.9,
            fontWeight: 900,
            color: '#17132b',
            letterSpacing: -4,
            fontFamily: font ? 'Anybody' : undefined,
          }}
        >
          <span>Show,</span>
          <span>don&rsquo;t tell.</span>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['#ff5fa2', '#38bdff', '#2fd98a', '#ffe14a'].map((c, i) => (
            <span
              key={c}
              style={{
                background: c,
                color: '#17132b',
                fontSize: 26,
                fontWeight: 700,
                padding: '10px 22px',
                borderRadius: 14,
                border: '3px solid #17132b',
              }}
            >
              {['Record', 'Meet', 'Book', 'Your brand'][i]}
            </span>
          ))}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: font ? [{ name: 'Anybody', data: font, weight: 900, style: 'normal' }] : undefined,
    },
  )
}
