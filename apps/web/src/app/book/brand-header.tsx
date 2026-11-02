import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { APP_NAME } from '@lmsy/shared'
import type { WorkspaceBrand } from '@/db/workspaces'
import { DEFAULT_ACCENT, themeVars } from '@/lib/brand-theme'
import { LogoMark } from '@/components/brand/logo'

export { DEFAULT_ACCENT }

/**
 * A business's public page: its light or dark theme, colour and heading font
 * apply to everything inside. `accent` overrides the brand colour (a calendar's own).
 */
export function BrandedPage({
  brand,
  accent,
  children,
  className = '',
}: {
  brand: WorkspaceBrand
  accent?: string | null
  children: ReactNode
  className?: string
}) {
  const style: CSSProperties = themeVars({
    accent: accent ?? brand.color,
    theme: brand.theme,
    font: brand.font,
  })
  return (
    <div data-theme={brand.theme} style={style} className={`theme-root min-h-screen ${className}`}>
      {children}
    </div>
  )
}

function Mark({ brand, name, size }: { brand: WorkspaceBrand; name: string; size: 'sm' | 'lg' }) {
  const logoH =
    size === 'sm'
      ? 'h-9'
      : brand.logoSize === 'small'
        ? 'h-10'
        : brand.logoSize === 'large'
          ? 'h-16'
          : 'h-12'
  return brand.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo} alt={name} className={`${logoH} w-auto max-w-[14rem] object-contain`} />
  ) : (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl bg-accent font-brand font-bold text-on-accent ${
        size === 'sm' ? 'h-10 w-10 text-base' : 'h-16 w-16 text-2xl'
      }`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

function CtaButton({ brand, className = '' }: { brand: WorkspaceBrand; className?: string }) {
  if (!brand.ctaLabel || !brand.ctaUrl) return null
  return (
    <a
      href={brand.ctaUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`btn-ghost px-4 py-2 text-center text-sm ${className}`}
    >
      {brand.ctaLabel}
    </a>
  )
}

/** The compact bar: logo or initial, name and tagline, optional button. */
export function BrandHeader({
  brand,
  fallbackName,
}: {
  brand: WorkspaceBrand
  fallbackName: string
}) {
  const name = brand.name || fallbackName
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3 text-ink">
        <Mark brand={brand} name={name} size="sm" />
        <span className="min-w-0">
          {!brand.logo || brand.name ? (
            <span className="block truncate font-brand font-bold">{name}</span>
          ) : null}
          {brand.tagline && (
            <span className="block truncate text-sm text-muted">{brand.tagline}</span>
          )}
        </span>
      </span>
      <CtaButton brand={brand} className="hidden shrink-0 sm:inline-flex" />
    </div>
  )
}

/**
 * The big header for a booking page: cover photo (or a wash of the brand
 * colour), the logo sitting on it, name, tagline, and the owner's photo + bio.
 */
export function BrandHero({
  brand,
  fallbackName,
  children,
}: {
  brand: WorkspaceBrand
  fallbackName: string
  children?: ReactNode
}) {
  const name = brand.name || fallbackName
  return (
    <header className="flex flex-col">
      <div
        className="h-40 w-full rounded-b-[2rem] bg-cover bg-center sm:h-56 sm:rounded-[2rem]"
        style={{
          backgroundImage: brand.coverUrl
            ? `url("${brand.coverUrl}")`
            : 'radial-gradient(60% 120% at 0% 0%, color-mix(in oklab, var(--color-accent) 85%, white), transparent 70%), radial-gradient(70% 120% at 100% 100%, color-mix(in oklab, var(--color-accent) 70%, #ff5fa2), transparent 70%), var(--color-accent)',
        }}
        role={brand.coverUrl ? 'img' : undefined}
        aria-label={brand.coverUrl ? `${name} cover photo` : undefined}
      />
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <div className="-mt-10 flex items-end justify-between gap-3 sm:-mt-12">
          <span className="grid min-h-20 min-w-20 place-items-center rounded-3xl border-4 border-[var(--color-canvas)] bg-surface p-2 shadow-sm">
            <Mark brand={brand} name={name} size="lg" />
          </span>
          <CtaButton brand={brand} className="mb-1 min-w-0" />
        </div>
        <h1 className="mt-4 font-brand text-[2.1rem] font-bold leading-tight tracking-tight text-ink sm:text-[2.6rem]">
          {name}
        </h1>
        {brand.tagline && <p className="mt-1 text-lg text-muted">{brand.tagline}</p>}
        {(brand.photoUrl || brand.bio) && (
          <div className="mt-5 flex items-start gap-4">
            {brand.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.photoUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-[var(--color-canvas)]"
              />
            )}
            {brand.bio && (
              <p className="max-w-xl whitespace-pre-line leading-relaxed text-muted">{brand.bio}</p>
            )}
          </div>
        )}
        {children}
      </div>
    </header>
  )
}

export function PoweredBy() {
  return (
    <footer className="mt-auto pb-8 pt-12 text-center text-xs text-faint">
      <Link href="/" className="inline-flex items-center gap-1.5 py-1 transition hover:text-muted">
        <LogoMark className="h-4 w-4" /> Powered by {APP_NAME}
      </Link>
    </footer>
  )
}
