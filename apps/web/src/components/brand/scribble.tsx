import type { CSSProperties } from 'react'

type Kind = 'circle' | 'underline' | 'arrow' | 'star'

// Hand-drawn marker strokes, in a 200 x 80 box (arrow: 120 x 80).
const PATHS: Record<Kind, { d: string[]; viewBox: string; len: number }> = {
  circle: {
    viewBox: '0 0 200 80',
    d: [
      'M60 8C24 10 5 26 8 44c4 22 55 32 102 29 46-3 83-17 82-37C190 14 146 3 98 5 70 6 44 12 30 20',
    ],
    len: 520,
  },
  underline: {
    viewBox: '0 0 200 24',
    d: ['M4 15c38-7 92-11 140-9 18 1 34 3 52 6', 'M30 21c40-4 86-5 128-2'],
    len: 220,
  },
  arrow: {
    viewBox: '0 0 120 80',
    d: ['M8 10c26 4 58 20 76 48', 'M66 56l20 6 4-21'],
    len: 120,
  },
  star: {
    viewBox: '0 0 80 80',
    d: ['M40 6l7 22 23 1-18 14 7 23-19-14-19 14 7-23-18-14 23-1z'],
    len: 260,
  },
}

/**
 * A marker stroke laid over content. It draws itself once (unless the visitor
 * prefers reduced motion, when it is simply there).
 */
export function Scribble({
  kind,
  className = '',
  color = 'var(--color-hl-yellow)',
  width = 5,
  delay = 0,
  duration = 0.9,
  animate = true,
}: {
  kind: Kind
  className?: string
  color?: string
  width?: number
  delay?: number
  duration?: number
  animate?: boolean
}) {
  const p = PATHS[kind]
  return (
    <svg
      viewBox={p.viewBox}
      className={`pointer-events-none ${className}`}
      fill="none"
      aria-hidden
      preserveAspectRatio="none"
    >
      {p.d.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={animate ? 'draw' : undefined}
          style={
            {
              '--len': p.len,
              '--delay': `${delay + i * 0.35}s`,
              '--dur': `${duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  )
}
