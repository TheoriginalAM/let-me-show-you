'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { brandVars, type MeetingBrand } from './_lib/brand'
import { cancelKnock, checkJoin, requestJoin, type JoinResult } from './actions'
import { useWakeLock } from './_lib/wake-lock'
import { BrandMark } from './brand-mark'
import { CallRoot, type EndReason, type JoinTracks } from './call'
import { PreJoinScreen, type JoinDetails, type PreJoinPhase, type PreviewMedia } from './prejoin'

export type { MeetingBrand }

type Stage =
  | { kind: 'prejoin'; phase: PreJoinPhase }
  | {
      kind: 'call'
      token: string
      serverUrl: string
      role: 'host' | 'guest'
      audioEnabled: boolean
      videoEnabled: boolean
      tracks: JoinTracks
      lobbyEnabled: boolean
    }
  | { kind: 'ended'; reason: EndReason }

const GUEST_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/
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

const END_COPY: Record<EndReason, { title: string; body: string; rejoin: boolean }> = {
  left: { title: 'You left the call', body: 'You can jump back in any time.', rejoin: true },
  removed: {
    title: 'You were removed from the call',
    body: 'A host removed you from this call.',
    rejoin: false,
  },
  ended: { title: 'The host ended the call', body: 'Thanks for joining.', rejoin: false },
  'ended-by-me': {
    title: 'Call ended',
    body: 'Everyone has been disconnected. Any recording will appear in your workspace in a few minutes.',
    rejoin: false,
  },
  duplicate: {
    title: 'You joined from another tab',
    body: 'This window was disconnected because you joined the same call somewhere else.',
    rejoin: true,
  },
  lost: {
    title: 'Connection lost',
    body: 'We lost the connection to the call. Check your internet and rejoin.',
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
  const [stage, setStage] = useState<Stage>({ kind: 'prejoin', phase: 'form' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The mic/camera choice as it is *now*: people often flip these while they
  // wait in the lobby, after the join details were sent.
  const media = useRef<PreviewMedia>({
    audioEnabled: true,
    videoEnabled: true,
    audioTrack: null,
    videoTrack: null,
  })
  const onMediaChange = useCallback((m: PreviewMedia) => {
    media.current = m
  }, [])
  // Preview tracks the call has taken over, so leaving the pre-join screen
  // doesn't stop them (phones would otherwise ask for permission again).
  const handedOver = useRef(new WeakSet<object>())
  const isHandedOver = useCallback((track: object) => handedOver.current.has(track), [])
  const guestKey = useRef('')

  useEffect(() => {
    guestKey.current = loadGuestKey(slug)
  }, [slug])

  const applyResult = useCallback(
    (res: JoinResult) => {
      switch (res.status) {
        case 'joined': {
          const m = media.current
          const tracks: JoinTracks = {
            audio: m.audioEnabled ? m.audioTrack : null,
            video: m.videoEnabled ? m.videoTrack : null,
          }
          if (tracks.audio) handedOver.current.add(tracks.audio)
          if (tracks.video) handedOver.current.add(tracks.video)
          setError(null)
          setStage({
            kind: 'call',
            token: res.token,
            serverUrl: res.serverUrl,
            role: res.role,
            audioEnabled: m.audioEnabled,
            videoEnabled: m.videoEnabled,
            tracks,
            lobbyEnabled: res.lobbyEnabled ?? lobbyEnabled,
          })
          break
        }
        case 'waiting':
          setStage({ kind: 'prejoin', phase: 'waiting' })
          break
        case 'denied':
          setStage({ kind: 'prejoin', phase: 'denied' })
          break
        case 'none':
          setError('Your request to join expired. Please ask again.')
          setStage({ kind: 'prejoin', phase: 'form' })
          break
        case 'error':
          setError(res.error)
          setStage({ kind: 'prejoin', phase: 'form' })
          break
      }
    },
    [lobbyEnabled],
  )

  const join = useCallback(
    async (d: JoinDetails) => {
      // What they chose on pressing Join; later lobby changes update it.
      media.current = {
        audioEnabled: d.audioEnabled,
        videoEnabled: d.videoEnabled,
        audioTrack: d.audioEnabled ? media.current.audioTrack : null,
        videoTrack: d.videoEnabled ? media.current.videoTrack : null,
      }
      setError(null)
      setBusy(true)
      try {
        applyResult(
          await requestJoin(slug, {
            name: d.name,
            email: d.email,
            guestKey: guestKey.current,
            website: d.website,
          }),
        )
      } catch {
        setError('Could not reach the call. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [slug, applyResult],
  )

  // In the lobby: poll until a host lets us in (or declines).
  const waiting = stage.kind === 'prejoin' && stage.phase === 'waiting'
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

  const onEnded = useCallback((reason: EndReason) => setStage({ kind: 'ended', reason }), [])

  // Keep a phone awake while waiting to be let in and during the call.
  useWakeLock(waiting || stage.kind === 'call')

  if (!configured) {
    return (
      <Shell brand={brand}>
        <Card title="Meetings aren't switched on yet">
          <p className="text-sm text-muted">
            This workspace&apos;s meeting rooms aren&apos;t available right now. Please check back soon.
          </p>
        </Card>
      </Shell>
    )
  }

  if (stage.kind === 'call') {
    return (
      <CallRoot
        token={stage.token}
        serverUrl={stage.serverUrl}
        role={stage.role}
        slug={slug}
        roomName={roomName}
        brand={brand}
        guestKey={guestKey.current}
        audioEnabled={stage.audioEnabled}
        videoEnabled={stage.videoEnabled}
        tracks={stage.tracks}
        lobbyEnabled={stage.lobbyEnabled}
        onEnded={onEnded}
      />
    )
  }

  if (stage.kind === 'ended') {
    const copy = END_COPY[stage.reason]
    return (
      <Shell brand={brand}>
        <Card title={copy.title}>
          <p className="text-sm text-muted">{copy.body}</p>
          {copy.rejoin && (
            // Back to the pre-join screen, so people can check their camera and
            // mic (and whoever else is on this device can change the name).
            <button
              type="button"
              className="mt-5 rounded-xl bg-[var(--room-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--room-accent-fg)] transition hover:opacity-90"
              onClick={() => {
                setError(null)
                setStage({ kind: 'prejoin', phase: 'form' })
              }}
            >
              Rejoin
            </button>
          )}
          {stage.reason === 'ended-by-me' && (
            <a
              href="/dashboard"
              className="mt-5 inline-block rounded-xl bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-white/[0.1]"
            >
              Open workspace
            </a>
          )}
        </Card>
      </Shell>
    )
  }

  return (
    <PreJoinScreen
      roomName={roomName}
      brand={brand}
      isHost={isHost}
      lobbyEnabled={lobbyEnabled}
      me={me}
      phase={stage.phase}
      busy={busy}
      error={error}
      onMediaChange={onMediaChange}
      isHandedOver={isHandedOver}
      onJoin={(d) => void join(d)}
      onCancelWaiting={() => {
        void cancelKnock(slug, guestKey.current)
        setStage({ kind: 'prejoin', phase: 'form' })
      }}
      onAskAgain={() => {
        // A fresh key is a fresh request (the declined one stays declined).
        guestKey.current = loadGuestKey(slug, true)
        setStage({ kind: 'prejoin', phase: 'form' })
      }}
    />
  )
}

function Shell({ brand, children }: { brand: MeetingBrand; children: React.ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-10"
      style={brandVars(brand.accent)}
    >
      <BrandMark brand={brand} />
      <div className="flex flex-1 items-center justify-center py-8">{children}</div>
    </main>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rise glass w-full max-w-md rounded-3xl p-7">
      <h1 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h1>
      <div className="mt-3">{children}</div>
    </div>
  )
}
