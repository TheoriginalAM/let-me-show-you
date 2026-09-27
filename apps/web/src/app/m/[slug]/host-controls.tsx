'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataChannel, useParticipants, useRoomContext } from '@livekit/components-react'
import { ConnectionState, RoomEvent, Track, type Participant } from 'livekit-client'
import type { LobbyGuest } from '@/db/meetings'
import {
  enforceGuestAccess,
  inviteToRoom,
  listLobby,
  muteParticipant,
  removeParticipant,
  respondToKnock,
  startRecording,
  stopRecording,
} from './actions'

const LOBBY_POLL_MS = 4000
/** Minimum gap between back-to-back lobby re-fetches. */
const REFRESH_SPACING_MS = 1000
/** How long to wait for LiveKit to confirm a record start/stop before giving up. */
const RECORD_CONFIRM_MS = 45_000

const pill =
  'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-white/[0.08] disabled:opacity-50'

/** Host-only controls in the call's top bar: record, people + lobby, invite. */
export function HostControls({ slug, isRecording }: { slug: string; isRecording: boolean }) {
  const [open, setOpen] = useState(false)
  const [guests, setGuests] = useState<LobbyGuest[]>([])
  const room = useRoomContext()
  const inFlight = useRef(false)
  const again = useRef(false)

  // Coalesced: at most one lobby fetch in flight, plus one trailing re-fetch.
  // Next runs a page's server actions one at a time, so an unbounded pile of
  // these would queue up behind (and delay) Mute/Remove/Stop.
  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        again.current = false
        const res = await listLobby(slug)
        if (res.ok) setGuests(res.guests)
        if (again.current) await new Promise((r) => setTimeout(r, REFRESH_SPACING_MS))
      } while (again.current)
    } catch {
      // transient: the next poll will catch up
    } finally {
      inFlight.current = false
    }
  }, [slug])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), LOBBY_POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // A knock (or another host's decision) pings the room so the list updates at
  // once. Only trust the server's own messages: participants (guests included)
  // can publish data, and theirs carry a sender.
  useDataChannel('lobby', (msg) => {
    if (!msg.from) void refresh()
  })

  // If a guest who was removed reconnects (e.g. with a token they still hold),
  // have the server take them out again.
  // Guests already in the room when we connect don't raise ParticipantConnected,
  // so also sweep everyone once our own connection completes.
  useEffect(() => {
    const check = (p: Participant): void => {
      if (p.identity.startsWith('g_')) void enforceGuestAccess(slug, p.identity).catch(() => undefined)
    }
    const sweep = (): void => room.remoteParticipants.forEach(check)
    room.on(RoomEvent.ParticipantConnected, check)
    room.on(RoomEvent.Connected, sweep)
    if (room.state === ConnectionState.Connected) sweep()
    return () => {
      room.off(RoomEvent.ParticipantConnected, check)
      room.off(RoomEvent.Connected, sweep)
    }
  }, [room, slug])

  return (
    <>
      <RecordButton slug={slug} isRecording={isRecording} />
      <button className={`relative ${pill}`} onClick={() => setOpen((o) => !o)}>
        People
        {guests.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">
            {guests.length}
          </span>
        )}
      </button>
      {open && (
        <HostPanel slug={slug} guests={guests} onChanged={refresh} onClose={() => setOpen(false)} />
      )}
      {!open && guests[0] && (
        <KnockToast
          slug={slug}
          guest={guests[0]}
          more={guests.length - 1}
          onChanged={refresh}
          onOpen={() => setOpen(true)}
        />
      )}
    </>
  )
}

function RecordButton({ slug, isRecording }: { slug: string; isRecording: boolean }) {
  const [pending, setPending] = useState<null | 'starting' | 'stopping'>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  // Clear "Starting…/Stopping…" once LiveKit reports the change (or give up).
  useEffect(() => {
    if ((pending === 'starting' && isRecording) || (pending === 'stopping' && !isRecording)) {
      setPending(null)
    }
  }, [isRecording, pending])
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(() => setPending(null), RECORD_CONFIRM_MS)
    return () => clearTimeout(t)
  }, [pending])
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 7000)
    return () => clearTimeout(t)
  }, [message])

  async function toggle(): Promise<void> {
    setMessage(null)
    if (isRecording) {
      setPending('stopping')
      const res = await stopRecording(slug).catch(() => ({ ok: false as const, error: 'Try again.' }))
      if (res.ok) {
        setMessage({
          tone: 'info',
          text: 'Recording stopped. It will appear in your workspace in a minute or two.',
        })
      } else {
        setPending(null)
        setMessage({ tone: 'error', text: res.error })
      }
    } else {
      setPending('starting')
      const res = await startRecording(
        slug,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ).catch(() => ({ ok: false as const, error: 'Could not start recording.' }))
      if (!res.ok) {
        setPending(null)
        setMessage({ tone: 'error', text: res.error })
      }
    }
  }

  const label =
    pending === 'starting'
      ? 'Starting…'
      : pending === 'stopping'
        ? 'Stopping…'
        : isRecording
          ? 'Stop recording'
          : 'Record'

  return (
    <>
      <button className={pill} disabled={pending !== null} onClick={() => void toggle()}>
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`}
            aria-hidden
          />
          {label}
        </span>
      </button>
      {message && (
        <div
          role="status"
          className={`fixed left-1/2 top-16 z-50 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl px-4 py-2.5 text-center text-sm shadow-2xl ${
            message.tone === 'error'
              ? 'bg-red-500/15 text-red-200 ring-1 ring-inset ring-red-500/30'
              : 'bg-[#15151f] text-ink ring-1 ring-inset ring-white/10'
          }`}
        >
          {message.text}
        </div>
      )}
    </>
  )
}

function HostPanel({
  slug,
  guests,
  onChanged,
  onClose,
}: {
  slug: string
  guests: LobbyGuest[]
  onChanged: () => Promise<void>
  onClose: () => void
}) {
  const participants = useParticipants()
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <aside className="fixed bottom-24 right-3 top-16 z-40 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d15]/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-ink">People</span>
        <button className="text-sm text-muted hover:text-ink" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {notice && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-inset ring-amber-500/25">
            {notice}
          </p>
        )}
        {guests.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              Waiting to join ({guests.length})
            </h3>
            <ul className="space-y-2">
              {guests.map((g) => (
                <li key={g.id} className="rounded-xl bg-white/[0.04] p-3">
                  <GuestDecision slug={slug} guest={g} onChanged={onChanged} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
            In the call ({participants.length})
          </h3>
          <ul className="space-y-1">
            {participants.map((p) => (
              <ParticipantRow key={p.identity} slug={slug} participant={p} onNotice={setNotice} />
            ))}
          </ul>
        </section>

        <InviteSection slug={slug} />
      </div>
    </aside>
  )
}

function GuestDecision({
  slug,
  guest,
  onChanged,
}: {
  slug: string
  guest: LobbyGuest
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  async function decide(admit: boolean): Promise<void> {
    setBusy(true)
    await respondToKnock(slug, guest.id, admit).catch(() => undefined)
    await onChanged()
    setBusy(false)
  }
  return (
    <div>
      <div className="truncate text-sm font-medium text-ink">{guest.name}</div>
      <div className="truncate text-xs text-faint">{guest.email}</div>
      <div className="mt-2 flex gap-2">
        <button
          className="rounded-lg bg-green-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-400 disabled:opacity-50"
          disabled={busy}
          onClick={() => void decide(true)}
        >
          Let in
        </button>
        <button
          className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
          disabled={busy}
          onClick={() => void decide(false)}
        >
          Deny
        </button>
      </div>
    </div>
  )
}

function ParticipantRow({
  slug,
  participant,
  onNotice,
}: {
  slug: string
  participant: Participant
  onNotice: (text: string) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [busy, setBusy] = useState(false)
  const mic = participant.getTrackPublication(Track.Source.Microphone)
  const micOn = Boolean(mic && !mic.isMuted)
  const isHostRole = participant.attributes?.role === 'host'

  useEffect(() => {
    if (!confirmRemove) return
    const t = setTimeout(() => setConfirmRemove(false), 3000)
    return () => clearTimeout(t)
  }, [confirmRemove])

  async function mute(): Promise<void> {
    if (!mic?.trackSid) return
    setBusy(true)
    await muteParticipant(slug, participant.identity, mic.trackSid).catch(() => undefined)
    setBusy(false)
  }

  async function remove(): Promise<void> {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setBusy(true)
    const res = await removeParticipant(slug, participant.identity).catch(() => null)
    setBusy(false)
    if (res?.ok && res.lobbyTurnedOn) {
      onNotice(
        `${participant.name || 'They'} can't rejoin without asking: the lobby is now on for this room.`,
      )
    }
  }

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">
          {participant.name || 'Guest'}
          {participant.isLocal && <span className="text-faint"> (you)</span>}
        </span>
        <span className="text-xs text-faint">
          {isHostRole ? 'Host' : 'Guest'} · {micOn ? 'Mic on' : 'Muted'}
        </span>
      </span>
      {!participant.isLocal && (
        <>
          {micOn && (
            <button
              className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
              disabled={busy}
              onClick={() => void mute()}
            >
              Mute
            </button>
          )}
          <button
            className={`rounded-md px-2 py-1 text-xs transition disabled:opacity-50 ${
              confirmRemove
                ? 'bg-red-500/20 text-red-200'
                : 'text-muted hover:bg-white/[0.06] hover:text-ink'
            }`}
            disabled={busy}
            onClick={() => void remove()}
          >
            {confirmRemove ? 'Confirm' : 'Remove'}
          </button>
        </>
      )}
    </li>
  )
}

function InviteSection({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  const [emails, setEmails] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/m/${slug}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setResult('Could not copy. Copy the address from your browser bar instead.')
    }
  }

  async function send(): Promise<void> {
    setBusy(true)
    setResult(null)
    try {
      const res = await inviteToRoom(slug, emails)
      if (!res.ok) {
        setResult(res.error)
      } else {
        setEmails('')
        setResult(
          res.failed.length
            ? `Sent ${res.sent}. Couldn't email ${res.failed.join(', ')}.`
            : `Invite sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}.`,
        )
      }
    } catch {
      setResult('Could not send invites. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Invite</h3>
      <button className={`w-full ${pill}`} onClick={() => void copyLink()}>
        {copied ? 'Link copied' : 'Copy meeting link'}
      </button>
      <textarea
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        rows={2}
        placeholder="Emails, separated by commas"
        className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-white/20 focus:outline-none"
      />
      <button
        className={`mt-2 w-full ${pill}`}
        disabled={busy || !emails.trim()}
        onClick={() => void send()}
      >
        {busy ? 'Sending…' : 'Email invite'}
      </button>
      {result && <p className="mt-2 text-xs text-muted">{result}</p>}
    </section>
  )
}

function KnockToast({
  slug,
  guest,
  more,
  onChanged,
  onOpen,
}: {
  slug: string
  guest: LobbyGuest
  more: number
  onChanged: () => Promise<void>
  onOpen: () => void
}) {
  return (
    <div className="fixed bottom-24 left-3 z-40 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-amber-400/30 bg-[#15151f]/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
        Someone wants to join
      </div>
      <GuestDecision slug={slug} guest={guest} onChanged={onChanged} />
      {more > 0 && (
        <button className="mt-2 text-xs text-muted underline hover:text-ink" onClick={onOpen}>
          +{more} more waiting
        </button>
      )}
    </div>
  )
}
