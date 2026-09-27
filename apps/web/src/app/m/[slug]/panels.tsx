'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocalParticipant, useParticipants, type ReceivedChatMessage } from '@livekit/components-react'
import { Track, type Participant } from 'livekit-client'
import type { LobbyGuest } from '@/db/meetings'
import {
  inviteToRoom,
  lowerHand,
  muteParticipant,
  removeParticipant,
  respondToKnock,
  setLobbyDuringCall,
} from './actions'
import { useCall } from './call-context'
import {
  CloseIcon,
  HandIcon,
  LinkIcon,
  MailIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PinIcon,
  SendIcon,
} from './icons'
import { cx, MenuDivider, MenuItem, Popover, Switch } from './ui'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// ---------------------------------------------------------------------------
// Container: a right-hand column on desktop (pushes the stage), a sheet on phones
// ---------------------------------------------------------------------------

export function SidePanel({
  guests,
  refreshLobby,
}: {
  guests: LobbyGuest[]
  refreshLobby: () => Promise<void>
}) {
  const { panel, setPanel } = useCall()
  const participants = useParticipants()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // What opened the panel, so closing it can hand focus back (otherwise it
  // falls to <body> and keyboard users lose their place).
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!panel) return
    if (!opener.current) {
      const a = document.activeElement
      opener.current = a instanceof HTMLElement && a !== document.body ? a : null
    }
    headingRef.current?.focus()
  }, [panel])

  const close = useCallback(() => {
    const back = opener.current
    setPanel(null)
    requestAnimationFrame(() => {
      const visible = (el: HTMLElement | null | undefined): el is HTMLElement =>
        !!el && el.isConnected && el.offsetParent !== null
      if (visible(back)) return back.focus()
      // The opener went away (e.g. a toast): use the dock's Chat or More button.
      const fallback = [
        ...document.querySelectorAll<HTMLElement>('button[aria-label^="Chat"], button[aria-label^="More options"]'),
      ].find(visible)
      fallback?.focus()
    })
  }, [setPanel])

  // Esc closes the panel, unless it's closing a menu or dialog on top of it.
  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[data-popover], dialog[open]')) return
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panel, close])

  if (!panel) return null
  return (
    <aside
      aria-label={panel === 'chat' ? 'Chat' : 'People'}
      className="fixed inset-x-0 bottom-0 top-[20%] z-40 flex flex-col rounded-t-3xl border border-white/10 bg-[#0d0d15] shadow-2xl sm:static sm:top-auto sm:z-auto sm:w-[22rem] sm:shrink-0 sm:rounded-2xl sm:bg-[#0d0d15]/80"
    >
      <div className="flex items-center gap-1 border-b border-white/[0.07] p-2">
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          {panel === 'chat' ? 'Chat' : 'People'}
        </h2>
        <TabButton active={panel === 'people'} onClick={() => setPanel('people')}>
          People · {participants.length}
          {guests.length > 0 && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />}
        </TabButton>
        <TabButton active={panel === 'chat'} onClick={() => setPanel('chat')}>
          Chat
        </TabButton>
        <button
          type="button"
          onClick={close}
          aria-label="Close panel"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-white/[0.07] hover:text-ink"
        >
          <CloseIcon size={18} />
        </button>
      </div>
      {panel === 'people' ? (
        <PeoplePanel guests={guests} refreshLobby={refreshLobby} />
      ) : (
        <ChatPanel />
      )}
    </aside>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium transition',
        active ? 'bg-white/[0.09] text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function sortParticipants(list: Participant[]): Participant[] {
  const handAt = (p: Participant): number => Number(p.attributes?.hand || 0)
  return [...list].sort((a, b) => {
    const ha = handAt(a)
    const hb = handAt(b)
    if (ha || hb) return !ha ? 1 : !hb ? -1 : ha - hb // raised hands first, in order
    const hostA = a.attributes?.role === 'host' ? 0 : 1
    const hostB = b.attributes?.role === 'host' ? 0 : 1
    if (hostA !== hostB) return hostA - hostB
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1
    return (a.name || '').localeCompare(b.name || '')
  })
}

function PeoplePanel({ guests, refreshLobby }: { guests: LobbyGuest[]; refreshLobby: () => Promise<void> }) {
  const participants = useParticipants()
  const { role } = useCall()
  const isHost = role === 'host'
  const sorted = sortParticipants(participants)
  const [admittingAll, setAdmittingAll] = useState(false)
  const { slug } = useCall()

  async function admitAll(): Promise<void> {
    setAdmittingAll(true)
    for (const g of guests) await respondToKnock(slug, g.id, true).catch(() => undefined)
    await refreshLobby()
    setAdmittingAll(false)
  }

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      {isHost && guests.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Waiting to join ({guests.length})
            </h3>
            {guests.length > 1 && (
              <button
                type="button"
                disabled={admittingAll}
                onClick={() => void admitAll()}
                className="text-xs font-medium text-[var(--room-accent-text)] hover:underline disabled:opacity-50"
              >
                Let everyone in
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {guests.map((g) => (
              <li key={g.id} className="rounded-xl bg-white/[0.04] p-3">
                <GuestDecision guest={g} onChanged={refreshLobby} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
          In the call ({participants.length})
        </h3>
        <ul className="space-y-0.5">
          {sorted.map((p) => (
            <PersonRow key={p.identity} participant={p} />
          ))}
        </ul>
      </section>

      {isHost && <HostFooter />}
    </div>
  )
}

export function GuestDecision({ guest, onChanged }: { guest: LobbyGuest; onChanged: () => Promise<void> }) {
  const { slug } = useCall()
  const [busy, setBusy] = useState(false)
  async function decide(admit: boolean): Promise<void> {
    setBusy(true)
    await respondToKnock(slug, guest.id, admit).catch(() => undefined)
    await onChanged()
    setBusy(false)
  }
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400/15 text-xs font-semibold text-amber-200">
        {initials(guest.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{guest.name}</div>
        <div className="truncate text-xs text-faint">{guest.email}</div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide(false)}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-white/[0.07] hover:text-ink disabled:opacity-50"
        >
          Deny
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void decide(true)}
          className="rounded-full bg-[var(--room-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--room-accent-fg)] transition hover:opacity-90 disabled:opacity-50"
        >
          Let in
        </button>
      </div>
    </div>
  )
}

function PersonRow({ participant: p }: { participant: Participant }) {
  const call = useCall()
  const isHost = call.role === 'host'
  const [open, setOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const name = p.name || 'Guest'
  const hand = p.attributes?.hand
  const hostRole = p.attributes?.role === 'host'
  const mic = p.getTrackPublication(Track.Source.Microphone)
  const micOn = Boolean(mic && !mic.isMuted)
  const camKey = `${p.identity}:${Track.Source.Camera}`
  const pinned = call.pinned === camKey

  async function mute(): Promise<void> {
    if (!mic?.trackSid) return
    const res = await muteParticipant(call.slug, p.identity, mic.trackSid).catch(() => null)
    if (res && !res.ok) call.notify(res.error, 'warn')
  }

  async function remove(): Promise<void> {
    const res = await removeParticipant(call.slug, p.identity).catch(() => null)
    if (res?.ok && res.lobbyTurnedOn) {
      call.setLobbyEnabled(true)
      call.notify(`${name} can't rejoin without asking: the lobby is now on.`, 'info')
    } else if (res && !res.ok) call.notify(res.error, 'warn')
    setConfirmRemove(false)
  }

  async function lower(): Promise<void> {
    const res = await lowerHand(call.slug, p.identity).catch(() => null)
    if (res && !res.ok) call.notify(res.error, 'warn')
  }

  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.03]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--room-accent-soft)] text-xs font-semibold text-ink">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-ink">
            {name}
            {p.isLocal && <span className="text-faint"> (you)</span>}
          </span>
          {hostRole && (
            <span className="shrink-0 rounded bg-[var(--room-accent-soft)] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ink">
              Host
            </span>
          )}
        </div>
        {confirmRemove ? (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-red-200">Remove {name}?</span>
            <button type="button" onClick={() => void remove()} className="font-semibold text-red-300 hover:underline">
              Remove
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)} className="text-muted hover:text-ink">
              Cancel
            </button>
          </div>
        ) : (
          hand && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-300">
              <HandIcon size={12} /> Hand raised
            </span>
          )
        )}
      </div>
      <span className={cx('shrink-0', micOn ? 'text-muted' : 'text-red-300')} aria-label={micOn ? 'Microphone on' : 'Microphone off'}>
        {micOn ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
      </span>
      <div ref={ref} className="relative shrink-0">
        <button
          type="button"
          aria-label={`Options for ${name}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-white/[0.08] hover:text-ink"
        >
          <MoreIcon size={16} />
        </button>
        <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} side="bottom" align="end" label={`Options for ${name}`}>
          <MenuItem icon={<PinIcon size={16} />} onSelect={() => (call.setPinned(pinned ? null : camKey), setOpen(false))}>
            {pinned ? 'Unpin' : 'Pin for me'}
          </MenuItem>
          {isHost && !p.isLocal && (
            <>
              {micOn && (
                <MenuItem icon={<MicOffIcon size={16} />} onSelect={() => (void mute(), setOpen(false))}>
                  Mute
                </MenuItem>
              )}
              {hand && (
                <MenuItem icon={<HandIcon size={16} />} onSelect={() => (void lower(), setOpen(false))}>
                  Lower hand
                </MenuItem>
              )}
              <MenuDivider />
              <MenuItem tone="danger" icon={<CloseIcon size={16} />} onSelect={() => (setConfirmRemove(true), setOpen(false))}>
                Remove from call
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
    </li>
  )
}

function HostFooter() {
  const call = useCall()
  const [emails, setEmails] = useState('')
  const [sending, setSending] = useState(false)

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/m/${call.slug}`)
      call.notify('Meeting link copied', 'success')
    } catch {
      call.notify('Copy the link from your address bar instead.', 'warn')
    }
  }

  async function send(): Promise<void> {
    setSending(true)
    try {
      const res = await inviteToRoom(call.slug, emails)
      if (!res.ok) call.notify(res.error, 'warn')
      else {
        setEmails('')
        call.notify(
          res.failed.length
            ? `Sent ${res.sent}. Couldn't email ${res.failed.join(', ')}.`
            : `Invite sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}`,
          res.failed.length ? 'warn' : 'success',
        )
      }
    } catch {
      call.notify('Could not send invites.', 'error')
    } finally {
      setSending(false)
    }
  }

  async function setLobby(on: boolean): Promise<void> {
    call.setLobbyEnabled(on)
    const res = await setLobbyDuringCall(call.slug, on).catch(() => null)
    if (!res?.ok) {
      call.setLobbyEnabled(!on)
      call.notify('Could not change that setting.', 'error')
    }
  }

  return (
    <section className="space-y-3 border-t border-white/[0.07] pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Invite</h3>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.06] py-2.5 text-sm font-medium text-ink transition hover:bg-white/[0.1]"
      >
        <LinkIcon size={16} /> Copy meeting link
      </button>
      <div className="flex gap-2">
        <input
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !sending && emails.trim() && void send()}
          placeholder="Emails, separated by commas"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-base text-ink placeholder:text-faint focus:border-[var(--room-accent-ring)] focus:outline-none sm:text-sm"
        />
        <button
          type="button"
          disabled={sending || !emails.trim()}
          onClick={() => void send()}
          aria-label="Email invite"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--room-accent)] text-[var(--room-accent-fg)] transition hover:opacity-90 disabled:opacity-40"
        >
          <MailIcon size={16} />
        </button>
      </div>
      <Switch
        checked={call.lobbyEnabled}
        onChange={(on) => void setLobby(on)}
        label="Guests must ask to join"
        hint="New guests wait until a host lets them in"
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

function Linkified({ text }: { text: unknown }) {
  // Chat arrives from other people's browsers: never assume it's a string.
  const parts = (typeof text === 'string' ? text : '').split(URL_RE)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-[var(--room-accent-text)] underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function groupMessages(messages: ReceivedChatMessage[]) {
  const groups: { key: string; from?: ReceivedChatMessage['from']; time: number; items: ReceivedChatMessage[] }[] = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    if (last && last.from?.identity === m.from?.identity && m.timestamp - last.time < 120_000) {
      last.items.push(m)
    } else {
      groups.push({ key: m.id, from: m.from, time: m.timestamp, items: [m] })
    }
  }
  return groups
}

function ChatPanel() {
  const { chat } = useCall()
  const { localParticipant } = useLocalParticipant()
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const groups = groupMessages(chat.messages)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages.length])

  async function send(): Promise<void> {
    const msg = text.trim().slice(0, 2000)
    if (!msg || chat.isSending) return
    setText('')
    try {
      await chat.send(msg)
    } catch {
      setText(msg)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {groups.length === 0 && (
          <p className="mt-6 text-center text-sm text-faint">
            Messages are visible to everyone in the call and disappear when it ends.
          </p>
        )}
        {groups.map((g) => {
          const mine = g.from?.identity === localParticipant.identity
          const host = g.from?.attributes?.role === 'host'
          return (
            <div key={g.key}>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink">{mine ? 'You' : g.from?.name || 'Guest'}</span>
                {host && (
                  <span className="rounded bg-[var(--room-accent-soft)] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ink">
                    Host
                  </span>
                )}
                <span className="text-xs tabular-nums text-faint">
                  {new Date(g.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <div className="space-y-1">
                {g.items.map((m) => (
                  <p
                    key={m.id}
                    className={cx(
                      'whitespace-pre-wrap break-words text-sm leading-relaxed',
                      mine ? 'rounded-xl bg-[var(--room-accent-soft)] px-3 py-2 text-ink' : 'text-ink/90',
                    )}
                  >
                    <Linkified text={m.message} />
                  </p>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <form
        className="flex items-end gap-2 border-t border-white/[0.07] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Send a message to everyone"
          aria-label="Message"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-base text-ink placeholder:text-faint focus:border-[var(--room-accent-ring)] focus:outline-none sm:text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim() || chat.isSending}
          aria-label="Send message"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--room-accent)] text-[var(--room-accent-fg)] transition hover:opacity-90 disabled:opacity-40"
        >
          <SendIcon size={16} />
        </button>
      </form>
    </div>
  )
}
