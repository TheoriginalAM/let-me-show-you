import type { ReactNode } from 'react'
import { Icon } from '@/components/brand/icons'
import { SECTIONS, type SectionId } from './sections'

/** A dashboard page's title, in its section's colour, with optional actions. */
export function PageHeader({
  section,
  title,
  description,
  actions,
}: {
  section?: SectionId
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  const s = section ? SECTIONS[section] : null
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 items-start gap-4">
        {s && (
          <span
            className="mt-1 grid h-12 w-12 shrink-0 -rotate-3 place-items-center rounded-2xl text-[#17132b] shadow-[0_3px_0_0_rgb(23_19_43/0.85)]"
            style={{ background: s.color }}
            aria-hidden
          >
            <Icon name={s.icon} className="h-6 w-6" strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-[2.15rem] font-extrabold leading-[1.05] tracking-tight text-ink">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
