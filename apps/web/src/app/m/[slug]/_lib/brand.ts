import type { CSSProperties } from 'react'

/** A room's white-label identity (the workspace's name, logo and accent). */
export interface MeetingBrand {
  name: string
  logo: string | null
  accent: string
}

type RGB = [number, number, number]

const WHITE: RGB = [255, 255, 255]
const INK: RGB = [11, 11, 18]
/** The lightest dark surface accent colours sit on (toasts, popovers). */
const SURFACE: RGB = [21, 21, 31]
const FALLBACK: RGB = [139, 139, 246]

function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB
}

const css = ([r, g, b]: RGB): string => `rgb(${r} ${g} ${b})`

/** Lighten a colour toward white until it reaches `ratio` against `bg`. */
function lightenTo(rgb: RGB, bg: RGB, ratio: number): RGB {
  let out = rgb
  for (let i = 0; i < 20 && contrast(out, bg) < ratio; i++) out = mix(out, WHITE, 0.12)
  return out
}

/**
 * CSS variables for a room's brand accent (WCAG-aware):
 * - `--room-accent`: the brand colour, for primary buttons and active states
 * - `--room-accent-fg`: white or near-black, whichever reads on the accent
 * - `--room-accent-ring`: the accent lightened to 3:1 on our lightest dark
 *   surface (focus rings, the speaking ring), so a navy brand still shows
 * - `--room-accent-text`: lightened to 4.5:1 for small text (links, actions)
 * - `--room-accent-soft`: a translucent tint for selected rows and toggles
 */
export function brandVars(accent: string): CSSProperties {
  const rgb = parseHex(accent) ?? FALLBACK
  const fg = contrast(rgb, WHITE) >= 4.5 ? WHITE : INK
  return {
    '--room-accent': css(rgb),
    '--room-accent-fg': css(fg),
    '--room-accent-ring': css(lightenTo(rgb, SURFACE, 3)),
    '--room-accent-text': css(lightenTo(rgb, SURFACE, 4.5)),
    '--room-accent-soft': `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / 0.16)`,
  } as CSSProperties
}
