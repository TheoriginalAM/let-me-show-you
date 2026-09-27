'use client'

import '@livekit/components-styles'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  LiveKitRoom,
  PreJoin,
  VideoConference,
  useIsRecording,
  type LocalUserChoices,
} from '@livekit/components-react'
import {
  ConnectionError,
  DisconnectReason,
  MediaDeviceFailure,
  type RoomOptions,
} from 'livekit-client'
import { cancelKnock, checkJoin, requestJoin, type JoinResult } from './actions'
import { HostControls } from './host-controls'

export interface MeetingBrand {
  name: string
  logo: string | null
  accent: string
}

type EndReason = 'left' | 'removed' | 'ended' | 'duplicate' | 'lost'

type Stage =
  | { kind: 'prejoin' }
  | { kind: 'waiting' }
  | { kind: 'denied' }
  | { kind: 'call'; token: string; serverUrl: string; role: 'host' | 'guest' }
  | { kind: 'ended'; reason: EndReason }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const GUEST_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/
// Shared with the comment form, so a client only types their details once.
const NAME_KEY = 'lmsy-comment-name'
const EMAIL_KEY = 'lmsy-comment-email'
const POLL_MS = 2500

/** A random secret for this browser + room; it's what proves "this is still me" in the lobby. */
function loadGuestKey(slug: string, fresh = false): string {
  const storageKey = `lmsy-meet-${slug}`
  const make = (): string => crypto.randomUUID().replace(/-/g, '')
  try {
    const existing = fresh ? null : localStorage.getItem(storageKey)
    if (existing && GUEST_KEY_RE.test(existing)) return existing
    const key = make()
    localStorage.setItem(storageKey, key)
    return key
  } catch {
    return make() // storage blocked: still works for this page load
  }
}

/**
 * A camera/mic problem (missing, blocked, or busy in another app), as opposed to
 * a connection failure. getFailure() alone isn't enough: it returns 'Other' for
 * any named error, connection errors included.
 */
function isDeviceError(error: Error): boolean {
  const failure = MediaDeviceFailure.getFailure(error)
  return (
    failure === MediaDeviceFailure.NotFound ||
    failure === MediaDeviceFailure.PermissionDenied ||
    failure === MediaDeviceFailure.DeviceInUse ||
    error.name === 'OverconstrainedError'
  )
}

const DEVICE_NOTICE =
  "We couldn't start your camera or microphone. Check your browser's permissions or close other apps using it, then turn it on from the controls below."
const PREVIEW_NOTICE =
  "We couldn't reach your camera or microphone. Check your browser's permissions, or join with them turned off."

/** LiveKit's dark theme, tinted with the workspace accent. */
function themeVars(accent: string): CSSProperties {
  return {
    '--lk-accent-bg': accent,
    '--lk-accent-fg': '#ffffff',
    '--lk-bg': '#08080c',
    '--lk-bg2': '#101019',
    '--lk-bg3': '#161622',
    '--lk-border-radius': '0.6rem',
  } as CSSProperties
}

const END_COPY: Record<EndReason, { title: string; body: string; rejoin: boolean }> = {
  left: { title: 'You left the meeting', body: 'You can jump back in any time.', rejoin: true },
  removed: {
    title: 'You were removed from the meeting',
    body: 'A host removed you from this call.',
    rejoin: false,
  },
  ended: { title: 'The meeting has ended', body: 'Thanks for joining.', rejoin: true },
  duplicate: {
    title: 'You joined from another tab',
    body: 'This window was disconnected because you joined the same meeting somewhere else.',
    rejoin: true,
  },
  lost: {
    title: 'Connection lost',
    body: 'We lost the connection to the meeting. Check your internet and rejoin.',
    rejoin: true,
  },
}

export function MeetingRoom({
  slug,
  roomName,
  brand,
  isHost,
  lobbyEnabled,
  me,
  configured,
}: {
  slug: string
  roomName: string
  brand: MeetingBrand
  isHost: boolean
  lobbyEnabled: boolean
  me: { name: string; email: string } | null
  configured: boolean
}) {
  const [stage, setStage] = useState<Stage>({ kind: 'prejoin' })
  const [choices, setChoices] = useState<LocalUserChoices | null>(null)
  const [email, setEmail] = useState(me?.email ?? '')
  const [defaultName, setDefaultName] = useState(me?.name ?? '')
  const [website, setWebsite] = useState('') // honeypot
  const [error, setError] = useState<string | null>(null)
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // PreJoin reads its defaults once, so hold it back until saved details load.
  const [loaded, setLoaded] = useState(false)
  const guestKey = useRef('')

  useEffect(() => {
    guestKey.current = loadGuestKey(slug)
    if (!me) {
      try {
        const savedEmail = localStorage.getItem(EMAIL_KEY)
        const savedName = localStorage.getItem(NAME_KEY)
        if (savedEmail) setEmail(savedEmail)
        if (savedName) setDefaultName(savedName)
      } catch {
        // storage blocked
      }
    }
    setLoaded(true)
  }, [slug, me])

  const applyResult = useCallback((res: JoinResult) => {
    switch (res.status) {
      case 'joined':
        setError(null)
        setStage({ kind: 'call', token: res.token, serverUrl: res.serverUrl, role: res.role })
        break
      case 'waiting':
        setStage({ kind: 'waiting' })
        break
      case 'denied':
        setStage({ kind: 'denied' })
        break
      case 'none':
        setError('Your request to join expired. Please ask again.')
        setStage({ kind: 'prejoin' })
        break
      case 'error':
        setError(res.error)
        setStage({ kind: 'prejoin' })
        break
    }
  }, [])

  const join = useCallback(
    async (values: LocalUserChoices) => {
      setChoices(values)
      setError(null)
      // A preview-time device warning may no longer apply; a real in-call
      // failure sets it again.
      setDeviceNotice(null)
      setBusy(true)
      try {
        applyResult(
          await requestJoin(slug, {
            name: values.username,
            email,
            guestKey: guestKey.current,
            website,
          }),
        )
        if (!me) {
          try {
            localStorage.setItem(NAME_KEY, values.username.trim())
            localStorage.setItem(EMAIL_KEY, email.trim())
          } catch {
            // storage blocked
          }
        }
      } catch {
        setError('Could not reach the meeting. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [slug, email, website, me, applyResult],
  )

  // In the lobby: poll until a host lets us in (or declines).
  const waiting = stage.kind === 'waiting'
  useEffect(() => {
    if (!waiting) return
    let active = true
    const id = setInterval(async () => {
      try {
        const res = await checkJoin(slug, guestKey.current)
        if (active && res.status !== 'waiting') applyResult(res)
      } catch {
        // transient network error: keep polling
      }
    }, POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [waiting, slug, applyResult])

  const roomOptions = useMemo<RoomOptions>(() => ({ adaptiveStream: true, dynacast: true }), [])

  // LiveKit reports a camera/mic failure as a device failure first, then passes
  // the same error to onError; this remembers the first so onError doesn't end
  // an otherwise healthy call over it.
  const deviceFailed = useRef(false)

  // A camera/mic failure keeps the call going (with that device off); only a
  // connection failure ends it. Anything else that's fatal also disconnects the
  // room, which onDisconnected handles.
  const onRoomError = useCallback((error: Error) => {
    if (deviceFailed.current || isDeviceError(error)) {
      deviceFailed.current = false
      setDeviceNotice(DEVICE_NOTICE)
      return
    }
    if (error instanceof ConnectionError || error.name === 'ConnectionError') {
      setStage({ kind: 'ended', reason: 'lost' })
      return
    }
    console.error('[meeting] room error:', error)
  }, [])

  const onPreviewError = useCallback(() => setDeviceNotice(PREVIEW_NOTICE), [])

  const onDeviceFailure = useCallback((_failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
    // Screen-share failures (e.g. cancelling the picker) arrive with no kind:
    // the control bar handles those, and camera/mic are fine.
    if (kind !== 'audioinput' && kind !== 'videoinput') return
    deviceFailed.current = true
    setDeviceNotice(DEVICE_NOTICE)
    // Remember it's off, so Rejoin doesn't hit the same failure again.
    setChoices((c) =>
      c
        ? {
            ...c,
            ...(kind === 'videoinput' ? { videoEnabled: false } : {}),
            ...(kind === 'audioinput' ? { audioEnabled: false } : {}),
          }
        : c,
    )
  }, [])

  const onDisconnected = useCallback((reason?: DisconnectReason) => {
    const mapped: EndReason =
      reason === DisconnectReason.PARTICIPANT_REMOVED
        ? 'removed'
        : reason === DisconnectReason.ROOM_DELETED
          ? 'ended'
          : reason === DisconnectReason.DUPLICATE_IDENTITY
            ? 'duplicate'
            : reason === DisconnectReason.CLIENT_INITIATED
              ? 'left'
              : 'lost'
    setStage({ kind: 'ended', reason: mapped })
  }, [])

  if (!configured) {
    return (
      <Shell brand={brand}>
        <Card title="Meetings aren't switched on yet">
          <p className="text-sm text-muted">
            This workspace's meeting rooms aren't available right now. Please check back soon.
          </p>
        </Card>
      </Shell>
    )
  }

  if (stage.kind === 'call') {
    return (
      <LiveKitRoom
        token={stage.token}
        serverUrl={stage.serverUrl}
        connect
        audio={
          choices?.audioEnabled ? { deviceId: choices.audioDeviceId || undefined } : false
        }
        video={
          choices?.videoEnabled ? { deviceId: choices.videoDeviceId || undefined } : false
        }
        options={roomOptions}
        onDisconnected={onDisconnected}
        onError={onRoomError}
        onMediaDeviceFailure={onDeviceFailure}
        data-lk-theme="default"
        style={{ height: '100dvh', ...themeVars(brand.accent) }}
      >
        <CallView
          slug={slug}
          roomName={roomName}
          brand={brand}
          role={stage.role}
          deviceNotice={deviceNotice}
          onDismissDeviceNotice={() => setDeviceNotice(null)}
        />
      </LiveKitRoom>
    )
  }

  if (stage.kind === 'waiting') {
    return (
      <Shell brand={brand}>
        <Card title="Waiting to be let in">
          <div className="flex items-center gap-3">
            <span
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/15"
              style={{ borderTopColor: brand.accent }}
              aria-hidden
            />
            <p className="text-sm text-muted">
              We've let the host know you're here. You'll join {roomName} as soon as they let you
              in.
            </p>
          </div>
          <button
            className="btn-ghost mt-5 px-4 py-2 text-sm"
            onClick={() => {
              void cancelKnock(slug, guestKey.current)
              setStage({ kind: 'prejoin' })
            }}
          >
            Cancel
          </button>
        </Card>
      </Shell>
    )
  }

  if (stage.kind === 'denied') {
    return (
      <Shell brand={brand}>
        <Card title="You weren't let in">
          <p className="text-sm text-muted">
            The host didn't admit you to this meeting. If you think that's a mistake, you can ask
            again.
          </p>
          <button
            className="btn-ghost mt-5 px-4 py-2 text-sm"
            onClick={() => {
              // A fresh key is a fresh request (the declined one stays declined).
              guestKey.current = loadGuestKey(slug, true)
              setStage({ kind: 'prejoin' })
            }}
          >
            Ask again
          </button>
        </Card>
      </Shell>
    )
  }

  if (stage.kind === 'ended') {
    const copy = END_COPY[stage.reason]
    return (
      <Shell brand={brand}>
        <Card title={copy.title}>
          <p className="text-sm text-muted">{copy.body}</p>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          {copy.rejoin && choices && (
            <button
              className="mt-5 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: brand.accent }}
              disabled={busy}
              onClick={() => void join(choices)}
            >
              {busy ? 'Rejoining…' : 'Rejoin'}
            </button>
          )}
        </Card>
      </Shell>
    )
  }

  // Pre-join: device check + details.
  const joinLabel = busy
    ? 'Joining…'
    : isHost
      ? 'Join as host'
      : lobbyEnabled
        ? 'Ask to join'
        : 'Join meeting'
  return (
    <Shell brand={brand}>
      <div className="w-full max-w-xl">
        <div className="mb-5 text-center">
          <p className="eyebrow">{isHost ? 'You are a host' : 'Video meeting'}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {roomName}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isHost
              ? 'Check your camera and mic, then join. Guests in the lobby will appear once you are in.'
              : 'Check your camera and mic before you join. Nothing to install.'}
          </p>
        </div>

        {!isHost && (
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-faint" htmlFor="meet-email">
              Your email (only the host sees it)
            </label>
            <input
              id="meet-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              placeholder="you@email.com"
              className="w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
            />
          </div>
        )}
        {/* Honeypot: hidden from people, tempting to bots. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="hidden"
        />

        <div
          data-lk-theme="default"
          className="overflow-hidden rounded-2xl border border-line"
          style={themeVars(brand.accent)}
        >
          {loaded ? (
            <PreJoin
              defaults={{ username: defaultName, videoEnabled: true, audioEnabled: true }}
              // We remember the name ourselves; LiveKit's own saved choices would
              // override it (even with an empty name) across every room.
              persistUserChoices={false}
              userLabel="Your name"
              joinLabel={joinLabel}
              onValidate={(values) =>
                !busy &&
                values.username.trim().length > 0 &&
                (isHost || EMAIL_RE.test(email.trim()))
              }
              // Must be stable: a new function restarts the camera/mic preview.
              onError={onPreviewError}
              onSubmit={(values) => void join(values)}
            />
          ) : (
            <div className="grid aspect-video place-items-center text-sm text-faint">Loading…</div>
          )}
        </div>
        {deviceNotice && <p className="mt-3 text-center text-sm text-amber-200">{deviceNotice}</p>}
        {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
      </div>
    </Shell>
  )
}

/** The in-call layout: branded bar on top, LiveKit's conference UI below. */
function CallView({
  slug,
  roomName,
  brand,
  role,
  deviceNotice,
  onDismissDeviceNotice,
}: {
  slug: string
  roomName: string
  brand: MeetingBrand
  role: 'host' | 'guest'
  deviceNotice: string | null
  onDismissDeviceNotice: () => void
}) {
  const isRecording = useIsRecording()
  const [notice, setNotice] = useState<string | null>(null)
  const wasRecording = useRef(false)

  // Everyone is told when recording starts (and on joining a call already being
  // recorded); the notice goes away if recording stops.
  useEffect(() => {
    if (isRecording && !wasRecording.current) {
      wasRecording.current = true
      setNotice('This meeting is being recorded.')
    } else if (!isRecording && wasRecording.current) {
      wasRecording.current = false
      setNotice(null)
    }
  }, [isRecording])
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 7000)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <BrandMark brand={brand} compact />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{roomName}</span>
        {isRecording && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300 ring-1 ring-inset ring-red-500/30">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
            Recording
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {role === 'host' && <HostControls slug={slug} isRecording={isRecording} />}
        </div>
      </header>
      {notice && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-center text-sm text-red-200">
          {notice}
        </div>
      )}
      {deviceNotice && (
        <div className="flex items-center justify-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-100">
          <span>{deviceNotice}</span>
          <button
            className="shrink-0 text-amber-200/80 hover:text-amber-100"
            onClick={onDismissDeviceNotice}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <VideoConference />
      </div>
    </div>
  )
}

function BrandMark({ brand, compact = false }: { brand: MeetingBrand; compact?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      {brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo}
          alt=""
          className={`${compact ? 'h-7' : 'h-10'} w-auto rounded-md object-contain`}
        />
      ) : (
        <span
          className={`grid ${compact ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm'} place-items-center rounded-lg font-bold text-white`}
          style={{ background: brand.accent }}
        >
          {brand.name.charAt(0).toUpperCase()}
        </span>
      )}
      {!compact && <span className="font-semibold text-ink">{brand.name}</span>}
    </span>
  )
}

function Shell({ brand, children }: { brand: MeetingBrand; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between">
        <BrandMark brand={brand} />
      </div>
      <div className="flex flex-1 items-center justify-center py-8">{children}</div>
    </main>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rise glass w-full max-w-md rounded-2xl p-6">
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <div className="mt-3">{children}</div>
    </div>
  )
}
