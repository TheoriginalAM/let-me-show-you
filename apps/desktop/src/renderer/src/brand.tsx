import type { ReactNode } from 'react'

/**
 * The Let Me Show You mark: a pointer on the brand colour, circled in
 * highlighter yellow (same artwork as the web app's logo).
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="logo-mark">
      <rect width="40" height="40" rx="11" fill="#4f3cff" />
      <path
        d="M8.6 13.4A8.6 5.6 -10 1 1 25.6 10.4A8.6 5.6 -10 1 1 8.6 13.4Z"
        fill="none"
        stroke="#ffe14a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M15.2 12.6v17.2l4.6-4.1 3.1 6.4 3.3-1.5-3-6.3 6.2-.4z"
        fill="#fff"
        stroke="#17132b"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export type IconName =
  'check' | 'lock' | 'camera' | 'warning' | 'film' | 'scissors' | 'gear' | 'play' | 'pause' | 'copy'

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  camera: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="3" />
      <path d="m15.5 10.2 5.5-3.2v10l-5.5-3.2" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.2 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9.4v5.2l4.4-2.6z" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M8.2 8.3 20 18M8.2 15.7 20 6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  pause: <path d="M8 5.5v13M16 5.5v13" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}
