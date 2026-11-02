import Link from 'next/link'
import { APP_NAME } from '@lmsy/shared'
import type { WorkspaceBrand } from '@/db/workspaces'

export const DEFAULT_ACCENT = '#8b8bf6' // luminous violet: the default brand accent

/** The business's logo + name (white-label), or the app's wordmark if unbranded. */
export function BrandHeader({ brand, fallbackName }: { brand: WorkspaceBrand; fallbackName: string }) {
  const accent = brand.color ?? DEFAULT_ACCENT
  const name = brand.name || fallbackName
  const logoH = brand.logoSize === 'small' ? 'h-9' : brand.logoSize === 'large' ? 'h-16' : 'h-12'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3 tracking-tight text-ink">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt="" className={`${logoH} w-auto rounded-md object-contain`} />
        ) : (
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
            style={{ background: accent }}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold">{name}</span>
          {brand.tagline && <span className="block truncate text-sm font-normal text-muted">{brand.tagline}</span>}
        </span>
      </span>
      {brand.ctaLabel && brand.ctaUrl && (
        <a
          href={brand.ctaUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="hidden shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 sm:inline-block"
          style={{ background: accent }}
        >
          {brand.ctaLabel}
        </a>
      )}
    </div>
  )
}

export function PoweredBy() {
  return (
    <footer className="mt-auto pt-8 text-center text-xs text-faint">
      <Link href="/" className="transition hover:text-muted">
        Powered by {APP_NAME}
      </Link>
    </footer>
  )
}
