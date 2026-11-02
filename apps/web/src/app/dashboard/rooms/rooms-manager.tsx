'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { inviteToRoom } from '@/app/m/[slug]/actions'
import { DEFAULT_ACCENT, onColor } from '@/lib/brand-theme'
import { resizeImage } from '@/lib/image-resize'
import { ROOM_BACKGROUNDS, roomBackgroundCss } from '@/lib/room-backgrounds'
import { Icon } from '@/components/brand/icons'
import { colourName } from '../colour-names'
import { createRoomAction, deleteRoomAction, setLobbyAction, updateRoomAction } from './actions'

interface RoomItem {
  id: string
  name: string
  slug: string
  lobbyEnabled: boolean
  welcomeMessage: string | null
  accentColor: string | null
  background: string | null
  backgroundImageUrl: string | null
}

interface Brand {
  name: string
  logo: string | null
  color: string | null
}

const inputCls =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-faint focus:border-ink focus:outline-none'
const ROOM_COLORS = ['#4f3cff', '#ff5fa2', '#ff8f2e', '#ffd23f', '#2fd98a', '#0ea5e9', '#e11d48']
const NETWORK_HINT = 'Check your connection and try again.'

function slugFrom(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 50)
    .replace(/-+$/, '')
}

/** What a guest sees before they join: the backdrop, logo, room name and welcome line. */
function WaitingPreview({
  brand,
  name,
  welcome,
  accent,
  background,
  imageUrl,
  size = 'lg',
}: {
  brand: Brand
  name: string
  welcome: string | null
  accent: string
  background: string | null
  imageUrl: string | null
  size?: 'sm' | 'lg'
}) {
  const bg = roomBackgroundCss(background, imageUrl)
  if (size === 'sm') {
    return (
      <div
        className="relative grid aspect-[4/3] w-28 shrink-0 place-items-center overflow-hidden rounded-xl"
        style={{ background: bg }}
      >
        <span className="h-7 w-10 rounded-md bg-black/35 ring-1 ring-white/20 backdrop-blur" />
        <span className="absolute bottom-2 h-2 w-9 rounded-full" style={{ background: accent }} />
      </div>
    )
  }
  return (
    <div
      className="relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-2xl p-5"
      style={{ background: bg }}
    >
      <div className="flex w-full max-w-[17rem] flex-col items-center gap-2.5 rounded-2xl bg-[#12101f]/75 p-4 text-center text-white ring-1 ring-white/10 backdrop-blur">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt="" className="h-7 w-auto max-w-[8rem] object-contain" />
        ) : (
          <span
            className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold"
            style={{ background: accent, color: onColor(accent) }}
          >
            {brand.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="font-display text-sm font-extrabold leading-tight">
          {name || 'Meeting room'}
        </span>
        {welcome && (
          <span className="line-clamp-3 text-[0.7rem] leading-snug text-white/75">{welcome}</span>
        )}
        <span className="mt-1 h-16 w-full rounded-lg bg-white/10" aria-hidden />
        <span
          className="w-full rounded-lg py-1.5 text-[0.72rem] font-bold"
          style={{ background: accent, color: onColor(accent) }}
        >
          Ask to join
        </span>
      </div>
    </div>
  )
}

export function RoomsManager({
  rooms,
  domain,
  brand,
}: {
  rooms: RoomItem[]
  domain: string
  brand: Brand
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function create(): void {
    if (pending) return // Enter can fire while a create is already running
    setError(null)
    startTransition(async () => {
      const res = await createRoomAction(name.trim() || 'Meeting room').catch(() => ({
        ok: false as const,
        error: `Couldn't create the room. ${NETWORK_HINT}`,
      }))
      if (res.ok) setName('')
      else setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} domain={domain} brand={brand} />
      ))}

      <div className="card rounded-2xl border-2 border-dashed p-5">
        <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">New room</h2>
        <p className="mt-1 text-sm text-muted">
          One for each client, a weekly check-in, or your team. Each room has its own link and look.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Acme weekly check-in"
            aria-label="Room name"
            className={inputCls}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button
            className="btn-primary shrink-0 px-5 py-2.5 text-sm"
            disabled={pending}
            onClick={create}
          >
            {pending ? 'Creating…' : 'Create room'}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

function RoomCard({ room, domain, brand }: { room: RoomItem; domain: string; brand: Brand }) {
  const link = `https://${domain}/m/${room.slug}`
  const accent = room.accentColor ?? brand.color ?? DEFAULT_ACCENT
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNote('Could not copy. Select the link and copy it manually.')
    }
  }

  /** Run an action; `failed` says what didn't happen if it gives no reason. */
  function run(fn: () => Promise<{ ok: boolean; error?: string }>, failed: string): void {
    setNote(null)
    startTransition(async () => {
      const res = await fn().catch(() => ({ ok: false, error: undefined }))
      if (!res.ok) setNote(res.error ?? `${failed} ${NETWORK_HINT}`)
    })
  }

  function sendInvites(): void {
    setNote(null)
    startTransition(async () => {
      const res = await inviteToRoom(room.slug, emails).catch(() => ({
        ok: false as const,
        error: `Couldn't send the invites. ${NETWORK_HINT}`,
      }))
      if (!res.ok) {
        setNote(res.error)
        return
      }
      setEmails('')
      setInviteOpen(false)
      setNote(
        res.failed.length
          ? `Sent ${res.sent}. Couldn't email ${res.failed.join(', ')}.`
          : `Invite sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}.`,
      )
    })
  }

  if (editing) {
    return <RoomEditor room={room} domain={domain} brand={brand} onDone={() => setEditing(false)} />
  }

  return (
    <div className="card rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-4">
        <WaitingPreview
          brand={brand}
          name={room.name}
          welcome={room.welcomeMessage}
          accent={accent}
          background={room.background}
          imageUrl={room.backgroundImageUrl}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-extrabold tracking-tight text-ink">
            {room.name}
          </h2>
          <p className="mt-1 truncate font-mono text-sm text-muted">
            {link.replace('https://', '')}
          </p>
          {room.welcomeMessage && (
            <p className="mt-1 line-clamp-1 text-sm text-faint">“{room.welcomeMessage}”</p>
          )}
        </div>
        <a
          href={`/m/${room.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary shrink-0 px-5 py-2.5 text-sm"
        >
          Start meeting
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setInviteOpen((o) => !o)}>
          Email invite
        </button>
        <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(true)}>
          <Icon name="branding" className="h-4 w-4" />
          Name, link and look
        </button>
        <label className="ml-1 flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            role="switch"
            checked={room.lobbyEnabled}
            disabled={pending}
            onChange={(e) => {
              const on = e.target.checked
              run(
                () => setLobbyAction(room.id, on),
                on ? "Couldn't turn the lobby on." : "Couldn't turn the lobby off.",
              )
            }}
            className="peer sr-only"
          />
          <span className="relative h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-hl-sky peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent-ink after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
          Guests wait in a lobby
        </label>
        <button
          className={`ml-auto rounded-lg px-3 py-1.5 text-sm transition ${
            confirmDelete ? 'bg-danger text-on-danger' : 'text-faint hover:text-danger'
          }`}
          disabled={pending}
          onClick={() =>
            confirmDelete
              ? run(() => deleteRoomAction(room.id), "Couldn't delete the room.")
              : setConfirmDelete(true)
          }
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>

      {inviteOpen && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="client@company.com, colleague@company.com"
            aria-label="Email addresses"
            className={inputCls}
          />
          <button
            className="btn-primary shrink-0 px-5 py-2.5 text-sm"
            disabled={pending || !emails.trim()}
            onClick={sendInvites}
          >
            {pending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
      {/* Notes are both confirmations ("Invite sent") and errors, so a polite status. */}
      {note && (
        <p role="status" className="mt-3 text-sm text-muted">
          {note}
        </p>
      )}
    </div>
  )
}

function RoomEditor({
  room,
  domain,
  brand,
  onDone,
}: {
  room: RoomItem
  domain: string
  brand: Brand
  onDone: () => void
}) {
  const [name, setName] = useState(room.name)
  const [slug, setSlug] = useState(room.slug)
  const [welcome, setWelcome] = useState(room.welcomeMessage ?? '')
  const [color, setColor] = useState<string | null>(room.accentColor)
  const [background, setBackground] = useState<string>(room.background ?? 'midnight')
  const [imageUrl, setImageUrl] = useState<string | null>(room.backgroundImageUrl)
  const [imageEdit, setImageEdit] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const accent = color ?? brand.color ?? DEFAULT_ACCENT
  const suggested = useMemo(() => slugFrom(name), [name])

  async function pickImage(file: File): Promise<void> {
    setError(null)
    try {
      const url = await resizeImage(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.8 })
      setImageUrl(url)
      setImageEdit(url)
      setBackground('image')
    } catch {
      setError('Could not read that image. Try a PNG or JPEG.')
    }
  }

  function save(): void {
    setError(null)
    startTransition(async () => {
      const res = await updateRoomAction(room.id, {
        name,
        slug,
        welcomeMessage: welcome,
        accentColor: color,
        background: background === 'image' && !imageUrl ? 'midnight' : background,
        backgroundImage: imageEdit,
      }).catch(() => ({ ok: false as const, error: `Couldn't save the room. ${NETWORK_HINT}` }))
      if (res.ok) onDone()
      else setError(res.error)
    })
  }

  return (
    <div className="card grid gap-6 rounded-2xl border-2 border-ink p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">
          Name, link and look
        </h2>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Room name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={inputCls}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-ink">
          Link
          <span className="flex min-w-0 items-center overflow-hidden rounded-xl border border-line-strong bg-surface focus-within:border-ink">
            <span
              className="max-w-[55%] shrink-0 truncate bg-surface-2 px-3 py-2.5 font-mono text-xs text-faint"
              dir="rtl"
            >
              <bdi dir="ltr">{domain}/m/</bdi>
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={50}
              aria-label="Room link"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-ink focus:outline-none"
            />
          </span>
          <span className="flex flex-wrap gap-x-3 text-xs font-normal text-faint">
            {suggested.length >= 3 && suggested !== slug && (
              <button
                type="button"
                className="text-accent-ink hover:underline"
                onClick={() => setSlug(suggested)}
              >
                Use “{suggested}”
              </button>
            )}
            {slug !== room.slug && <span>The old link keeps working.</span>}
            <span>A named link is easier to guess, so keep the lobby on.</span>
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Welcome message
          <textarea
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="Hi! Grab a coffee, I’ll let you in in a moment."
            className={inputCls}
          />
        </label>
        <fieldset className="flex flex-col gap-2 text-sm font-medium text-ink">
          <legend className="mb-1.5">Colour</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColor(null)}
              aria-pressed={color === null}
              className={`h-8 rounded-full px-3 text-xs font-medium transition ${
                color === null
                  ? 'bg-ink text-canvas'
                  : 'border border-line-strong text-muted hover:text-ink'
              }`}
            >
              Brand
            </button>
            {ROOM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={colourName(c)}
                title={colourName(c)}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full transition hover:scale-110 ${color === c ? 'ring-[3px] ring-ink ring-offset-2 ring-offset-[var(--color-surface)]' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 text-sm font-medium text-ink">
          <legend className="mb-1.5">Backdrop</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {ROOM_BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBackground(b.id)}
                aria-pressed={background === b.id}
                aria-label={b.label}
                title={b.label}
                className={`aspect-square rounded-xl transition hover:scale-105 ${
                  background === b.id
                    ? 'ring-[3px] ring-ink ring-offset-2 ring-offset-[var(--color-surface)]'
                    : ''
                }`}
                style={{ background: b.css }}
              />
            ))}
            <button
              type="button"
              onClick={() => (imageUrl ? setBackground('image') : fileRef.current?.click())}
              aria-pressed={background === 'image'}
              aria-label="Your photo"
              title="Your photo"
              className={`grid aspect-square place-items-center overflow-hidden rounded-xl border-2 border-dashed border-line-strong bg-surface-2 bg-cover bg-center text-faint transition hover:scale-105 ${
                background === 'image'
                  ? 'ring-[3px] ring-ink ring-offset-2 ring-offset-[var(--color-surface)]'
                  : ''
              }`}
              style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}
            >
              {!imageUrl && <Icon name="plus" className="h-5 w-5" />}
            </button>
          </div>
          <span className="flex gap-3 text-xs font-normal">
            <button
              type="button"
              className="text-accent-ink hover:underline"
              onClick={() => fileRef.current?.click()}
            >
              {imageUrl ? 'Upload a different photo' : 'Upload your own photo'}
            </button>
            {imageUrl && (
              <button
                type="button"
                className="text-muted hover:text-danger"
                onClick={() => {
                  setImageUrl(null)
                  setImageEdit(null)
                  if (background === 'image') setBackground('midnight')
                }}
              >
                Remove photo
              </button>
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void pickImage(f)
            }}
          />
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button className="btn-primary px-5 py-2.5 text-sm" disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save room'}
          </button>
          <button className="btn-ghost px-4 py-2.5 text-sm" disabled={pending} onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
      <div className="order-first flex flex-col gap-2 xl:order-none">
        <span className="text-sm font-semibold text-ink">What guests see</span>
        <WaitingPreview
          brand={brand}
          name={name}
          welcome={welcome.trim() || null}
          accent={accent}
          background={background}
          imageUrl={imageUrl}
        />
      </div>
    </div>
  )
}
