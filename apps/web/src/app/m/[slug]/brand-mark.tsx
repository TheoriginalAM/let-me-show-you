import type { MeetingBrand } from './_lib/brand'
import { cx } from './ui'

/** The workspace logo (or an initial on the accent) with an optional name. */
export function BrandMark({
  brand,
  size = 'md',
  showName = true,
}: {
  brand: MeetingBrand
  size?: 'sm' | 'md'
  showName?: boolean
}) {
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-2.5">
      {brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo}
          alt={showName ? '' : brand.name}
          className={cx(size === 'sm' ? 'h-7' : 'h-10', 'w-auto rounded-md object-contain')}
        />
      ) : (
        <span
          className={cx(
            'grid place-items-center rounded-lg bg-[var(--room-accent)] font-bold text-[var(--room-accent-fg)]',
            size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm',
          )}
          aria-hidden={showName}
        >
          {brand.name.charAt(0).toUpperCase()}
        </span>
      )}
      {showName && <span className="truncate font-semibold text-ink">{brand.name}</span>}
    </span>
  )
}
