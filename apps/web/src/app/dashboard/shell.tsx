'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { Icon, type IconName } from '@/components/brand/icons'
import { Logo, LogoMark } from '@/components/brand/logo'
import { authClient } from '@/lib/auth-client'
import { onColor } from '@/lib/brand-theme'
import { SECTIONS, type SectionId } from './sections'
import { createWorkspaceAction, switchWorkspaceAction } from './workspace-actions'

interface WS {
  id: string
  name: string
  role: 'owner' | 'member'
}

interface ShellProps {
  user: { name: string; email: string; isAdmin: boolean }
  workspaces: WS[]
  activeId: string | null
  activeLogo: string | null
  activeColor: string | null
  unread: number
  children: ReactNode
}

function initial(name: string | undefined): string {
  return (name ?? '?').trim().charAt(0).toUpperCase() || '?'
}

// A steady colour per business, so the same business always looks the same.
const SWATCHES = ['#ff5fa2', '#38bdff', '#2fd98a', '#ff8f2e', '#ffe14a', '#a78bfa']
function swatch(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return SWATCHES[h % SWATCHES.length]!
}

function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({
  href,
  label,
  icon,
  color,
  active,
  badge,
  onNavigate,
}: {
  href: string
  label: string
  icon: IconName
  color?: string
  active: boolean
  badge?: number
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-[0.92rem] transition ${
        active ? 'bg-canvas font-semibold text-ink' : 'text-muted hover:bg-canvas hover:text-ink'
      }`}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
          active
            ? 'text-[#17132b] shadow-[0_2px_0_0_rgb(23_19_43/0.8)]'
            : 'bg-surface-2 text-muted group-hover:text-ink'
        }`}
        style={active && color ? { background: color } : undefined}
      >
        <Icon name={icon} className="h-[1.1rem] w-[1.1rem]" strokeWidth={active ? 2.1 : 1.8} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[0.68rem] font-bold text-on-accent">
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </Link>
  )
}

function BusinessPicker({
  workspaces,
  activeId,
  activeLogo,
  activeColor,
}: Omit<ShellProps, 'user' | 'unread' | 'children'>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null
  const activeBg = activeColor ?? (active ? swatch(active.id) : '#ffe14a')

  useEffect(() => {
    if (!open) return
    function onDown(e: PointerEvent): void {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    // Capture phase, and stop it there: Escape closes this list only, not the
    // phone menu it may sit in.
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      if (box.current?.contains(document.activeElement)) trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function switchTo(id: string): void {
    setOpen(false)
    if (id === active?.id) return
    startTransition(async () => {
      await switchWorkspaceAction(id)
      router.refresh()
    })
  }

  function create(e: React.FormEvent): void {
    e.preventDefault()
    const n = name.trim()
    if (!n || pending) return
    startTransition(async () => {
      await createWorkspaceAction(n)
      setName('')
      setCreating(false)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-2 text-left transition hover:border-line-strong"
      >
        {activeLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeLogo}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-line"
          />
        ) : (
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-base font-extrabold"
            style={{ background: activeBg, color: onColor(activeBg) }}
            aria-hidden
          >
            {initial(active?.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.92rem] font-semibold text-ink">
            {active?.name ?? 'No business'}
          </span>
          <span className="block text-xs text-faint">
            {pending ? 'Switching…' : active?.role === 'owner' ? 'Owner' : 'Member'}
          </span>
        </span>
        <Icon
          name="chevron"
          className={`h-4 w-4 shrink-0 text-faint transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_40px_-16px_rgb(23_19_43/0.35)]">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-semibold text-faint">Your businesses</p>
          {/* Plain buttons in a list: Tab moves through them, aria-current marks the active one. */}
          <ul aria-label="Your businesses" className="flex max-h-72 flex-col overflow-y-auto">
            {workspaces.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  aria-current={w.id === active?.id ? 'true' : undefined}
                  onClick={() => switchTo(w.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition hover:bg-canvas"
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg font-display text-xs font-extrabold"
                    style={{ background: swatch(w.id), color: onColor(swatch(w.id)) }}
                    aria-hidden
                  >
                    {initial(w.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{w.name}</span>
                  {w.id === active?.id && (
                    <Icon name="check" className="h-4 w-4 text-accent-ink" strokeWidth={2.4} />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1.5">
            {creating ? (
              <form onSubmit={create} className="flex flex-col gap-2 p-1.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoFocus
                  placeholder="Business name"
                  aria-label="Business name"
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending || !name.trim()}
                    className="btn-primary flex-1 px-3 py-1.5 text-sm"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="btn-ghost px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-accent-ink transition hover:bg-canvas"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg border-2 border-dashed border-line-strong">
                  <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
                </span>
                Add a business
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function DashboardShell(props: ShellProps) {
  const { user, workspaces, activeId, unread, children } = props
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const main = useRef<HTMLElement>(null)
  const isOwner = (workspaces.find((w) => w.id === activeId) ?? workspaces[0])?.role === 'owner'
  const close = () => setMenuOpen(false)

  // Phone menu: move focus in, keep the page behind out of reach (inert is set
  // on the DOM node, as React 18 has no inert prop), and Escape closes it.
  useEffect(() => {
    if (main.current) main.current.inert = menuOpen
    if (!menuOpen) return
    menu.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus()
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      menuButton.current?.focus()
    }
    // Widening to the desktop layout hides the menu, so close it (and un-inert the page).
    const wide = window.matchMedia('(min-width: 64rem)')
    function onWide(): void {
      if (wide.matches) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWide)
    return () => {
      document.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
    }
  }, [menuOpen])

  async function signOut(): Promise<void> {
    setSigningOut(true)
    await authClient.signOut()
    router.push('/')
    router.refresh()
  }

  const nav = (
    <div className="flex h-full flex-col gap-5">
      <BusinessPicker {...props} />
      <nav aria-label="Dashboard" className="flex flex-col gap-0.5">
        {(Object.keys(SECTIONS) as SectionId[])
          .filter((id) => !SECTIONS[id].ownerOnly || isOwner)
          .map((id) => {
            const s = SECTIONS[id]
            return (
              <NavLink
                key={id}
                href={s.href}
                label={s.label}
                icon={s.icon}
                color={s.color}
                active={isActive(pathname, s.href)}
                onNavigate={close}
              />
            )
          })}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-4">
        <NavLink
          href="/dashboard/notifications"
          label="Notifications"
          icon="bell"
          active={isActive(pathname, '/dashboard/notifications')}
          badge={unread}
          onNavigate={close}
        />
        <NavLink
          href="/dashboard/settings"
          label="Your account"
          icon="settings"
          active={isActive(pathname, '/dashboard/settings')}
          onNavigate={close}
        />
        {user.isAdmin && (
          <NavLink href="/admin" label="Admin" icon="admin" active={false} onNavigate={close} />
        )}
        <div className="mt-3 flex items-center gap-3 rounded-xl px-2.5 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-display text-xs font-extrabold text-canvas">
            {initial(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-xs text-faint">{user.email}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mx-2.5 mb-1 self-start text-sm text-faint underline-offset-4 transition hover:text-ink hover:underline disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 z-30 hidden h-screen flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-4 py-5 lg:flex">
        <Link href="/dashboard" className="px-1.5" aria-label="Let Me Show You, Recordings">
          <Logo className="text-[0.95rem]" markClass="h-8 w-8" />
        </Link>
        {nav}
      </aside>

      {/* Phone / tablet top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" aria-label="Let Me Show You, Recordings">
          <LogoMark className="h-8 w-8" />
        </Link>
        <button
          ref={menuButton}
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="dashboard-menu"
          aria-label={unread > 0 ? `Menu, ${unread} unread` : undefined}
          className="btn-ghost relative gap-2 px-3 py-1.5 text-sm"
        >
          <Icon name={menuOpen ? 'close' : 'menu'} className="h-4 w-4" strokeWidth={2.2} />
          Menu
          {unread > 0 && !menuOpen && (
            <span
              className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-hl-pink ring-2 ring-surface"
              aria-hidden
            />
          )}
        </button>
      </div>
      {menuOpen && (
        <div
          ref={menu}
          id="dashboard-menu"
          className="fixed inset-x-0 bottom-0 top-[3.6rem] z-30 overflow-y-auto bg-surface px-4 py-5 lg:hidden"
        >
          {nav}
        </div>
      )}

      <main ref={main} className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-11">
        {children}
      </main>
    </div>
  )
}
