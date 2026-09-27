'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { CheckIcon } from './icons'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Close something on outside click/tap or Esc. Esc also puts keyboard focus
 * back on the trigger (the button inside `ref` that opened it).
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Handled: anything else listening for Esc (e.g. the side panel) skips it.
      e.preventDefault()
      close.current()
      const root = ref.current
      ;(root?.querySelector<HTMLElement>('[aria-expanded="true"]') ?? root?.querySelector<HTMLElement>('button'))?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, ref])
}

/** Round 44px icon button with a tooltip; `tone` colours the state. */
export function IconButton({
  label,
  tone = 'default',
  active = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  tone?: 'default' | 'danger' | 'off' | 'accent'
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--room-accent-ring)] disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'off' && 'bg-red-500/20 text-red-200 hover:bg-red-500/30',
        tone === 'danger' && 'bg-red-500 text-white hover:bg-red-400',
        tone === 'accent' && 'bg-[var(--room-accent)] text-[var(--room-accent-fg)] hover:opacity-90',
        tone === 'default' &&
          (active
            ? 'bg-[var(--room-accent-soft)] text-ink ring-1 ring-inset ring-[var(--room-accent-ring)]'
            : 'bg-white/[0.06] text-ink hover:bg-white/[0.12]'),
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** A floating panel anchored above (or below) its trigger. */
export function Popover({
  open,
  onClose,
  anchorRef,
  side = 'top',
  align = 'center',
  className,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  className?: string
  children: ReactNode
  label: string
}) {
  useDismiss(anchorRef, open, onClose)
  const panel = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const [shift, setShift] = useState(0)

  // Keep the panel on screen: nudge it sideways if its natural position would
  // overflow the viewport (e.g. a menu near the edge of a phone). Measured once
  // per opening, at its natural spot (the shift is 0 while closed). The nudge
  // is a `translate`, which moves it however it's anchored (a margin wouldn't
  // move a right-anchored panel, and the measurement would never settle).
  useLayoutEffect(() => {
    if (!open) {
      setShift(0)
      if (wasOpen.current) {
        wasOpen.current = false
        // Choosing an item unmounts it, which drops focus to <body>: put it
        // back on the trigger so keyboard users keep their place.
        const active = document.activeElement
        if (!active || active === document.body) {
          const root = anchorRef.current
          ;(root?.querySelector<HTMLElement>('[aria-haspopup]') ?? root?.querySelector<HTMLElement>('button'))?.focus()
        }
      }
      return
    }
    wasOpen.current = true
    const el = panel.current
    if (!el) return
    const margin = 8
    const r = el.getBoundingClientRect()
    let next = 0
    if (r.right > window.innerWidth - margin) next = window.innerWidth - margin - r.right
    if (r.left + next < margin) next = margin - r.left
    setShift(next)
  }, [open, anchorRef])

  if (!open) return null
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      data-popover=""
      style={
        shift
          ? { translate: align === 'center' ? `calc(-50% + ${shift}px) 0` : `${shift}px 0` }
          : undefined
      }
      className={cx(
        // Height-capped so a tall menu never runs off the top of a short screen.
        'absolute z-50 max-h-[calc(100dvh-7rem)] min-w-60 max-w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#111119]/95 p-1.5 text-sm shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl',
        side === 'top' ? 'bottom-full mb-3' : 'top-full mt-3',
        align === 'start' && 'left-0',
        align === 'end' && 'right-0',
        align === 'center' && 'left-1/2 -translate-x-1/2',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </div>
  )
}

export function MenuItem({
  children,
  selected,
  onSelect,
  tone,
  disabled,
  icon,
  hint,
}: {
  children: ReactNode
  selected?: boolean
  onSelect: () => void
  tone?: 'danger'
  disabled?: boolean
  icon?: ReactNode
  hint?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'danger' ? 'text-red-300 hover:bg-red-500/10' : 'text-ink hover:bg-white/[0.07]',
      )}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {hint && <span className="block truncate text-xs text-faint">{hint}</span>}
      </span>
      {selected && <CheckIcon size={16} className="shrink-0 text-[var(--room-accent-ring)]" />}
    </button>
  )
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-white/[0.07]" />
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-center justify-between gap-4 py-2',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--room-accent-ring)]',
          checked ? 'bg-[var(--room-accent)]' : 'bg-white/15',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  )
}

/** A labelled <select> styled for the dark call UI. */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const empty = options.length === 0
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-faint">{label}</span>
      <select
        value={empty ? '' : value}
        disabled={disabled || empty}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none truncate rounded-xl border border-white/10 bg-white/[0.04] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239c9cb4%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:14px] bg-[right_0.8rem_center] bg-no-repeat px-3 py-2.5 pr-9 text-base text-ink focus:border-[var(--room-accent-ring)] focus:outline-none disabled:opacity-50 sm:text-sm"
      >
        {empty && <option value="">None available (check browser permissions)</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#16161f]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A live level meter (0..1), e.g. for the microphone. */
export function LevelMeter({ level, bars = 10 }: { level: number; bars?: number }) {
  const lit = Math.round(Math.min(1, level * 4) * bars)
  return (
    <div className="flex h-3 items-end gap-[3px]" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cx(
            'w-1 rounded-full transition-[height,background-color] duration-75',
            i < lit ? 'bg-[var(--room-accent-ring)]' : 'bg-white/15',
          )}
          style={{ height: `${35 + (i / bars) * 65}%` }}
        />
      ))}
    </div>
  )
}
