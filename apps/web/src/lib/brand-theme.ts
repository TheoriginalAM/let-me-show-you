// Colour and type maths for themes: Let Me Show You's own, and each business's
// (accent, light/dark, heading font) on its public pages. No server imports:
// used on both sides.

import type { CSSProperties } from 'react'

/** Let Me Show You's signature colour: an electric blue-violet. */
export const DEFAULT_ACCENT = '#4f3cff'

export type BrandTheme = 'light' | 'dark'
export type BrandFont = 'modern' | 'classic' | 'friendly' | 'bold'

export const BRAND_FONTS: { id: BrandFont; label: string; family: string }[] = [
  { id: 'modern', label: 'Modern', family: 'var(--font-hanken)' },
  { id: 'classic', label: 'Classic', family: 'var(--font-fraunces)' },
  { id: 'friendly', label: 'Friendly', family: 'var(--font-nunito)' },
  { id: 'bold', label: 'Bold', family: 'var(--font-anybody)' },
]

export function brandTheme(value: string | null | undefined): BrandTheme {
  return value === 'dark' ? 'dark' : 'light'
}

export function brandFont(value: string | null | undefined): BrandFont {
  return BRAND_FONTS.some((f) => f.id === value) ? (value as BrandFont) : 'modern'
}

type RGB = [number, number, number]

const WHITE: RGB = [255, 255, 255]
const INK: RGB = [23, 19, 43]
const LIGHT_CANVAS: RGB = [244, 243, 251]
const DARK_SURFACE: RGB = [30, 27, 48]

export function parseHex(hex: string | null | undefined): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  if (!m) return null
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

/** A `#rrggbb` colour, or null if it isn't one. */
export function cleanHex(hex: string | null | undefined): string | null {
  const rgb = parseHex(hex)
  return rgb ? `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}` : null
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as RGB
}

export const rgbCss = ([r, g, b]: RGB): string => `rgb(${r} ${g} ${b})`

/** Move a colour toward `toward` until it reaches `ratio` against `bg`. */
function pushTo(rgb: RGB, bg: RGB, ratio: number, toward: RGB): RGB {
  let out = rgb
  for (let i = 0; i < 24 && contrast(out, bg) < ratio; i++) out = mix(out, toward, 0.12)
  return out
}

/** White or ink, whichever has more contrast on the colour. */
function onRgb(rgb: RGB): string {
  return contrast(rgb, WHITE) >= contrast(rgb, INK) ? '#ffffff' : rgbCss(INK)
}

const hexOf = ([r, g, b]: RGB): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/** The colour, darkened until it reads as small text on white (for emails and links). */
export function readableOnWhite(hex: string | null | undefined): string {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_ACCENT)!
  return hexOf(pushTo(rgb, WHITE, 4.5, INK))
}

/** A darker edge for a "pressable" button in the colour. */
export function pressedEdge(hex: string | null | undefined): string {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_ACCENT)!
  return hexOf(mix(rgb, INK, 0.32))
}

/** White or ink, whichever reads on the colour. */
export function onColor(hex: string | null | undefined): string {
  return onRgb(parseHex(hex) ?? parseHex(DEFAULT_ACCENT)!)
}

/**
 * CSS variables that re-theme everything inside an element: the accent family
 * (WCAG-aware for text and focus rings on that theme) and the heading font.
 * Pair with `data-theme={theme}` on the same element.
 */
export function themeVars(opts: {
  accent?: string | null
  theme?: BrandTheme
  font?: BrandFont
}): CSSProperties {
  const dark = opts.theme === 'dark'
  const bg = dark ? DARK_SURFACE : LIGHT_CANVAS
  const brand = parseHex(opts.accent) ?? parseHex(DEFAULT_ACCENT)!
  // On a dark page a very dark brand colour (navy, ink) would vanish into the
  // background, so lift it until buttons and selected days still stand out.
  const rgb = dark ? pushTo(brand, bg, 3, WHITE) : brand
  const vars: Record<string, string> = {
    '--color-accent': rgbCss(rgb),
    // The "pressed key" edge under primary buttons.
    '--color-accent-strong': rgbCss(mix(rgb, INK, 0.32)),
    // Accent as small text / rings: pushed until it reads on this theme.
    '--color-accent-ink': rgbCss(pushTo(rgb, bg, 4.5, dark ? WHITE : INK)),
    '--color-on-accent': onRgb(rgb),
  }
  if (opts.font) vars['--font-brand'] = BRAND_FONTS.find((f) => f.id === opts.font)!.family
  return vars as CSSProperties
}
