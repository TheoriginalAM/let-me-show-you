import { APP_NAME } from '@lmsy/shared'

/**
 * The mark: a pointer on the brand colour, circled in highlighter yellow.
 * Someone pointing something out to you.
 */
export function LogoMark({ className = 'h-8 w-8', title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <rect width="40" height="40" rx="11" fill="#4f3cff" />
      <path
        d="M10.4 15.6C6.6 11.2 13 5.6 20.6 6.2c6.6.5 9.4 5.6 5.4 9.2-3.6 3.2-12.4 3.4-16.2-.6-1.4-1.6-.8-3.6.8-4.6"
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

/** Mark + name, for headers. `wide` stretches the name (when there's room). */
export function Logo({
  className = '',
  markClass = 'h-8 w-8',
  wide = false,
  compact = false,
}: {
  className?: string
  markClass?: string
  wide?: boolean
  /** Hide the name on narrow screens (the mark stands alone). */
  compact?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClass} />
      <span
        className={`${wide ? 'wide' : ''} ${compact ? 'hidden sm:inline' : ''} whitespace-nowrap font-display text-[1.02em] font-extrabold tracking-tight text-ink`}
      >
        {APP_NAME}
      </span>
    </span>
  )
}
