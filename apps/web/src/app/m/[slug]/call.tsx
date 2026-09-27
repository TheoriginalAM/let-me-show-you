'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionQualityIndicator,
  useConnectionState,
  useIsRecording,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import {
  ConnectionError,
  ConnectionErrorReason,
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
  MediaDeviceFailure,
  ParticipantEvent,
  Room,
  RoomEvent,
  supportsAudioOutputSelection,
  Track,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type TrackPublication,
} from 'livekit-client'
import { brandVars, type MeetingBrand } from './_lib/brand'
import {
  BLUR_FAILED_COPY,
  enableCamera,
  isDeviceError,
  publishCameraTrack,
  setCameraOn,
  useCallBlur,
  useCallNoise,
} from './_lib/call-media'
import { sourceTrack } from './_lib/devices'
import { audioConstraints, getPrefs } from './_lib/prefs'
import { QUALITY } from './_lib/quality'
import { shortcut } from './_lib/shortcuts'
import { BrandMark } from './brand-mark'
import { CallProvider, useCall } from './call-context'
import { Dock, userMicToggle } from './dock'
import { LockIcon, ShareStopIcon, SignalIcon } from './icons'
import { SidePanel, GuestDecision } from './panels'
import { SettingsDialog } from './settings-dialog'
import { ReactionsLayer, Stage, useReactionFeed } from './stage'
import { cx } from './ui'
import { useLobby } from './use-lobby'

export type EndReason = 'left' | 'removed' | 'ended' | 'ended-by-me' | 'duplicate' | 'lost'

/** The pre-join preview's live tracks, taken over by the call. */
export interface JoinTracks {
  audio: LocalAudioTrack | null
  video: LocalVideoTrack | null
}

const CAMERA_FAILED_COPY = "We couldn't start your camera. It may be in use by another app."

/**
 * Build the Room once, from the preferences chosen before joining. The Room is
 * ours (passed as `room`), so LiveKitRoom never rebuilds it; everything that
 * changes mid-call goes through room/track APIs instead.
 */
function createRoom(): Room {
  const prefs = getPrefs()
  const q = QUALITY[prefs.quality]
  let audioOutput: { deviceId: string } | undefined
  try {
    if (prefs.audioOutputId && supportsAudioOutputSelection()) audioOutput = { deviceId: prefs.audioOutputId }
  } catch {
    // not supported
  }
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      ...(prefs.videoInputId ? { deviceId: prefs.videoInputId } : {}),
      resolution: q.preset.resolution,
    },
    audioCaptureDefaults: {
      ...(prefs.audioInputId ? { deviceId: prefs.audioInputId } : {}),
      ...audioConstraints(prefs.noise),
    },
    publishDefaults: { videoSimulcastLayers: q.layers },
    audioOutput,
  })
}

export function CallRoot({
  token,
  serverUrl,
  role,
  slug,
  roomName,
  brand,
  guestKey,
  audioEnabled,
  videoEnabled,
  tracks,
  lobbyEnabled,
  onEnded,
}: {
  token: string
  serverUrl: string
  role: 'host' | 'guest'
  slug: string
  roomName: string
  brand: MeetingBrand
  guestKey: string
  audioEnabled: boolean
  videoEnabled: boolean
  /** Preview tracks to publish instead of capturing again (see useJoinMedia). */
  tracks: JoinTracks
  lobbyEnabled: boolean
  onEnded: (reason: EndReason) => void
}) {
  const [room] = useState(createRoom)
  // No preview camera to take over but blur on: we start the camera ourselves
  // once connected, so the processor is attached before anything is published.
  const [blurredJoin] = useState(() => videoEnabled && !tracks.video && getPrefs().blur)
  const endedByMe = useRef(false)
  const deviceFailed = useRef(false)
  const [notice, setNotice] = useState<string | null>(null)

  // A failed connect can report both an error and a disconnect: end once.
  const ended = useRef(false)
  const end = useCallback(
    (reason: EndReason) => {
      if (ended.current) return
      ended.current = true
      // Taken-over preview tracks that never got published would otherwise keep
      // the camera light on (published ones are stopped by LiveKit already).
      tracks.audio?.stop()
      tracks.video?.stop()
      onEnded(reason)
    },
    [onEnded, tracks],
  )

  const onDisconnected = useCallback(
    (reason?: DisconnectReason) => {
      end(
        reason === DisconnectReason.PARTICIPANT_REMOVED
          ? 'removed'
          : reason === DisconnectReason.ROOM_DELETED
            ? endedByMe.current
              ? 'ended-by-me'
              : 'ended'
            : reason === DisconnectReason.DUPLICATE_IDENTITY
              ? 'duplicate'
              : reason === DisconnectReason.CLIENT_INITIATED
                ? 'left'
                : 'lost',
      )
    },
    [end],
  )

  // A camera/mic failure keeps the call going (that device stays off); only a
  // connection failure ends it. Other fatal errors also disconnect the room.
  const onError = useCallback(
    (error: Error) => {
      if (deviceFailed.current || isDeviceError(error)) {
        deviceFailed.current = false
        setNotice("We couldn't start your camera or microphone. Check your browser's permissions or close other apps using it.")
        return
      }
      // Connecting was cancelled because we're leaving (e.g. unmounting): not a failure.
      if (error instanceof ConnectionError && error.reason === ConnectionErrorReason.Cancelled) return
      if (error instanceof ConnectionError || error.name === 'ConnectionError') end('lost')
      else console.error('[meeting] room error:', error)
    },
    [end],
  )

  const onDeviceFailure = useCallback((_f?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
    // Screen-share failures (e.g. cancelling the picker) have no kind.
    if (kind === 'audioinput' || kind === 'videoinput') deviceFailed.current = true
  }, [])

  return (
    <LiveKitRoom
      room={room}
      token={token}
      serverUrl={serverUrl}
      connect
      audio={audioEnabled && !tracks.audio}
      video={videoEnabled && !tracks.video && !blurredJoin}
      onDisconnected={onDisconnected}
      onError={onError}
      onMediaDeviceFailure={onDeviceFailure}
      className="h-dvh"
      style={brandVars(brand.accent)}
      data-meeting-call=""
    >
      <CallProvider
        slug={slug}
        roomName={roomName}
        brand={brand}
        role={role}
        guestKey={guestKey}
        initialLobby={lobbyEnabled}
        endedByMeRef={endedByMe}
      >
        <CallView
          deviceNotice={notice}
          clearDeviceNotice={() => setNotice(null)}
          tracks={tracks}
          blurredJoin={blurredJoin}
        />
      </CallProvider>
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

// ---------------------------------------------------------------------------

function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

function CallView({
  deviceNotice,
  clearDeviceNotice,
  tracks,
  blurredJoin,
}: {
  deviceNotice: string | null
  clearDeviceNotice: () => void
  tracks: JoinTracks
  blurredJoin: boolean
}) {
  const call = useCall()
  const { brand, roomName, role, slug, notices, dismiss, notify, panel, setLobbyEnabled, setSettingsOpen } =
    call
  const isHost = role === 'host'
  const room = useRoomContext()
  const participants = useParticipants()
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant()
  const isRecording = useIsRecording()
  const connection = useConnectionState()
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant })
  const { guests, lobbyEnabled: serverLobby, refresh } = useLobby(slug, roomName, isHost)
  const reactions = useReactionFeed()
  const now = useNow()

  useJoinMedia(tracks, blurredJoin)
  useCallBlur(() => notify("Background blur couldn't start on this device, so it's been turned off.", 'warn'))
  useCallNoise()
  useShortcuts()
  useTalkingWhileMuted()
  useHostMuteNotice()
  useChatToasts()

  // Another host (or removing someone) can change the lobby setting.
  useEffect(() => {
    if (serverLobby !== null) setLobbyEnabled(serverLobby)
  }, [serverLobby, setLobbyEnabled])

  // Device problems surface as toasts.
  useEffect(() => {
    if (!deviceNotice) return
    notify(deviceNotice, 'warn')
    clearDeviceNotice()
  }, [deviceNotice, notify, clearDeviceNotice])

  // Meeting timer: from the earliest arrival still in the room.
  const startedAt = participants.reduce<number | null>((min, p) => {
    const t = p.joinedAt?.getTime()
    return t && (min === null || t < min) ? t : min
  }, null)

  // Recording: elapsed time since we saw it start; guests get a consent prompt.
  const [recSince, setRecSince] = useState<number | null>(null)
  const [consented, setConsented] = useState(false)
  useEffect(() => {
    if (isRecording) setRecSince((s) => s ?? Date.now())
    else {
      setRecSince(null)
      setConsented(false)
    }
  }, [isRecording])
  useEffect(() => {
    if (isRecording && isHost) notify('Recording started. Everyone can see it.', 'info')
  }, [isRecording, isHost, notify])
  const askConsent = isRecording && !isHost && !consented
  // Only one modal at a time: the consent question wins.
  useEffect(() => {
    if (askConsent) setSettingsOpen(false)
  }, [askConsent, setSettingsOpen])

  const reconnecting = connection === ConnectionState.Reconnecting
  const signal: 0 | 1 | 2 | 3 =
    quality === ConnectionQuality.Excellent
      ? 3
      : quality === ConnectionQuality.Good
        ? 2
        : quality === ConnectionQuality.Poor
          ? 1
          : quality === ConnectionQuality.Lost
            ? 0
            : 3

  return (
    <div className="relative flex h-full flex-col bg-canvas pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-ink">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 px-3 sm:px-5">
        <BrandMark brand={brand} size="sm" showName={false} />
        <span className="min-w-0 truncate text-[15px] font-semibold">{roomName}</span>
        {call.lobbyEnabled && isHost && (
          <LockIcon size={14} className="shrink-0 text-faint" aria-label="Guests must ask to join" />
        )}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {isRecording && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-200 ring-1 ring-inset ring-red-500/30">
              <span className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden />
              Recording
              {recSince && <span className="tabular-nums text-red-200/80">{formatClock(now - recSince)}</span>}
            </span>
          )}
          {startedAt && (
            <span className="hidden text-sm tabular-nums text-muted sm:inline" aria-label="Call length">
              {formatClock(now - startedAt)}
            </span>
          )}
          <span
            className={cx('hidden sm:inline', signal <= 1 ? 'text-amber-300' : 'text-muted')}
            title={signal <= 1 ? 'Your connection is unstable' : 'Connection is good'}
          >
            <SignalIcon level={signal} size={18} />
          </span>
        </div>
      </header>

      {/* Presenting bar */}
      {isScreenShareEnabled && (
        <div className="mx-3 mb-2 flex items-center justify-center gap-3 rounded-xl bg-[var(--room-accent-soft)] px-4 py-2 text-sm sm:mx-5">
          <span>You&apos;re presenting to everyone</span>
          <button
            type="button"
            onClick={() => void localParticipant.setScreenShareEnabled(false)}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold transition hover:bg-white/15"
          >
            <ShareStopIcon size={14} /> Stop presenting
          </button>
        </div>
      )}

      {/* Stage + side panel */}
      <main className="relative flex min-h-0 flex-1 gap-3 px-3 sm:px-5">
        <div className={cx('relative min-w-0 flex-1 transition-opacity', reconnecting && 'opacity-60')}>
          <Stage />
          {participants.length === 1 && (
            <AloneHint isHost={isHost} slug={slug} onCopied={() => notify('Meeting link copied', 'success')} />
          )}
          <ReactionsLayer items={reactions.items} onRemote={reactions.add} />
        </div>
        {panel && <SidePanel guests={guests} refreshLobby={refresh} />}
      </main>

      <Dock onReaction={(e) => reactions.add(e, 'You')} />

      {/* Toasts: knock requests first (hosts), then notices */}
      <div
        className={cx(
          'pointer-events-none absolute right-3 top-[calc(4rem+env(safe-area-inset-top))] z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2',
          // Keep clear of the side panel (22rem + the stage's gap and padding).
          panel ? 'sm:right-[24.75rem] sm:w-[min(22rem,calc(100vw-26.25rem))]' : 'sm:right-5',
        )}
        aria-live="polite"
      >
        {isHost && guests[0] && panel !== 'people' && (
          <div className="pointer-events-auto rounded-2xl border border-amber-400/30 bg-[#15151f]/95 p-3 shadow-2xl backdrop-blur-xl">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
              Wants to join
            </div>
            <GuestDecision guest={guests[0]} onChanged={refresh} />
            {guests.length > 1 && (
              <button
                type="button"
                onClick={() => call.setPanel('people')}
                className="mt-2 text-xs text-muted underline hover:text-ink"
              >
                {guests.length - 1} more waiting
              </button>
            )}
          </div>
        )}
        {notices.map((n) => (
          <div
            key={n.id}
            role="status"
            className={cx(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl',
              n.tone === 'error' && 'border-red-500/30 bg-red-950/80 text-red-100',
              n.tone === 'warn' && 'border-amber-400/30 bg-[#1b170c]/95 text-amber-100',
              (n.tone === 'info' || n.tone === 'success') && 'border-white/10 bg-[#15151f]/95 text-ink',
            )}
          >
            <span className="min-w-0 flex-1">{n.text}</span>
            {n.action && (
              <button
                type="button"
                onClick={() => {
                  n.action?.run()
                  dismiss(n.id)
                }}
                className="shrink-0 font-semibold text-[var(--room-accent-text)] hover:underline"
              >
                {n.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Reconnecting */}
      {reconnecting && (
        <div
          className="pointer-events-none absolute inset-x-0 top-[calc(5rem+env(safe-area-inset-top))] z-50 flex justify-center"
          role="alert"
        >
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#15151f]/95 px-5 py-2.5 text-sm shadow-2xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white motion-reduce:animate-none" aria-hidden />
            Reconnecting…
          </div>
        </div>
      )}

      {/* Audio blocked by the browser (e.g. joined from the lobby without a click) */}
      <div className="absolute inset-x-0 top-[calc(5rem+env(safe-area-inset-top))] z-40 flex justify-center">
        <StartAudio
          label="Click to turn on sound"
          className="rounded-full bg-[var(--room-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--room-accent-fg)] shadow-2xl"
        />
      </div>

      <RecordingConsent
        open={askConsent}
        brandName={brand.name}
        onContinue={() => setConsented(true)}
        onLeave={() => void room.disconnect()}
      />

      <SettingsDialog />
    </div>
  )
}

/**
 * Guests must acknowledge a recording. A native modal <dialog> keeps focus
 * inside and makes the rest of the page inert. There's no silent way out: Esc
 * is ignored, and if the browser closes it anyway it opens again.
 */
function RecordingConsent({
  open,
  brandName,
  onContinue,
  onLeave,
}: {
  open: boolean
  brandName: string
  onContinue: () => void
  onLeave: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)
  const [closedAt, setClosedAt] = useState(0)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // Start on the safe choice: showModal would otherwise focus "Leave call".
      continueRef.current?.focus()
    }
    if (!open && d.open) d.close()
  }, [open, closedAt])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => e.preventDefault()}
      onClose={() => setClosedAt((n) => n + 1)}
      aria-labelledby="rec-title"
      aria-describedby="rec-body"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] max-w-none rounded-3xl border border-white/10 bg-[#111119] p-6 text-ink shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      {open && (
        <>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />
            <h2 id="rec-title" className="font-display text-lg font-semibold text-ink">
              This call is being recorded
            </h2>
          </div>
          <p id="rec-body" className="mt-3 text-sm leading-relaxed text-muted">
            {brandName} is recording this call. The recording will be saved to their workspace.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onLeave}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted transition hover:text-ink"
            >
              Leave call
            </button>
            <button
              ref={continueRef}
              type="button"
              onClick={onContinue}
              className="rounded-full bg-[var(--room-accent)] px-5 py-2 text-sm font-semibold text-[var(--room-accent-fg)] transition hover:opacity-90"
            >
              Continue
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}

function AloneHint({ isHost, slug, onCopied }: { isHost: boolean; slug: string; onCopied: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-[#15151f]/90 py-2 pl-4 pr-2 text-sm shadow-xl backdrop-blur-xl">
        <span className="text-muted">
          {isHost ? "You're the only one here." : 'Waiting for others to join…'}
        </span>
        {isHost && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(`${window.location.origin}/m/${slug}`)
                .then(onCopied)
                .catch(() => undefined)
            }}
            className="rounded-full bg-[var(--room-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--room-accent-fg)] transition hover:opacity-90"
          >
            Copy invite link
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Behaviours
// ---------------------------------------------------------------------------

/**
 * Once connected, publish the mic and camera the pre-join preview was already
 * using, rather than letting LiveKitRoom open them again: phones would ask for
 * permission a second time, and the camera would blink off and on. Blur is on
 * the preview's camera already (or attached before publishing). With no
 * preview camera but blur on, the camera is started fresh with blur attached.
 */
function useJoinMedia(tracks: JoinTracks, blurredCamera: boolean): void {
  const room = useRoomContext()
  const { notify } = useCall()
  const started = useRef(false)
  useEffect(() => {
    if (!tracks.audio && !tracks.video && !blurredCamera) return
    const publish = async (): Promise<void> => {
      if (tracks.audio) {
        try {
          await room.localParticipant.publishTrack(tracks.audio, { source: Track.Source.Microphone })
        } catch (error) {
          console.error('[meeting] could not publish microphone:', error)
          tracks.audio.stop()
          notify("We couldn't turn on your microphone. Try the microphone button.", 'warn')
        }
      }
      try {
        const result = tracks.video
          ? await publishCameraTrack(room, tracks.video)
          : blurredCamera
            ? await enableCamera(room)
            : 'ok'
        if (result === 'blur-failed') notify(BLUR_FAILED_COPY, 'warn')
      } catch (error) {
        console.error('[meeting] could not publish camera:', error)
        tracks.video?.stop()
        notify(CAMERA_FAILED_COPY, 'warn')
      }
    }
    const start = (): void => {
      if (started.current) return
      started.current = true
      void publish()
    }
    if (room.state === ConnectionState.Connected) start()
    room.on(RoomEvent.Connected, start)
    return () => {
      room.off(RoomEvent.Connected, start)
    }
  }, [room, tracks, blurredCamera, notify])
}

/** ⌘/Ctrl+D mic, ⌘/Ctrl+E camera (Meet's convention). Ignored while typing. */
function useShortcuts(): void {
  const room = useRoomContext()
  const { notify } = useCall()
  const busy = useRef(false)
  useEffect(() => {
    const run = (fn: () => Promise<void>): void => {
      if (busy.current) return
      busy.current = true
      void fn().finally(() => {
        busy.current = false
      })
    }
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const key = e.key.toLowerCase()
      if (key !== 'd' && key !== 'e') return
      // Always claim the keys (⌘D would bookmark, ⌘E search), but act once per press.
      e.preventDefault()
      if (e.repeat) return
      const lp = room.localParticipant
      if (key === 'd') {
        run(async () => {
          userMicToggle.at = Date.now()
          await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled).catch(() => {
            notify("We couldn't start your microphone. Check your browser's permissions.", 'error')
          })
        })
      } else {
        run(async () => {
          try {
            if ((await setCameraOn(room, !lp.isCameraEnabled)) === 'blur-failed') notify(BLUR_FAILED_COPY, 'warn')
          } catch {
            notify(CAMERA_FAILED_COPY, 'error')
          }
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [room, notify])
}

/** A short toast for new chat messages while the chat panel is closed. */
function useChatToasts(): void {
  const { chat, panel, notify, setPanel } = useCall()
  const seen = useRef(chat.messages.length)
  useEffect(() => {
    const fresh = chat.messages.slice(seen.current)
    seen.current = chat.messages.length
    if (panel === 'chat') return
    const last = [...fresh].reverse().find((m) => m.from && !m.from.isLocal)
    if (!last) return
    const text = typeof last.message === 'string' ? last.message.replace(/\s+/g, ' ').trim() : ''
    if (!text) return
    notify(`${last.from?.name || 'Guest'}: ${text.length > 90 ? `${text.slice(0, 90)}…` : text}`, 'info', {
      label: 'Reply',
      run: () => setPanel('chat'),
    })
  }, [chat.messages, panel, notify, setPanel])
}

/**
 * "You're muted" when you start talking with the mic off. Muting leaves the
 * track live but disabled, so listen to an enabled clone of it.
 */
function useTalkingWhileMuted(): void {
  const { microphoneTrack, isMicrophoneEnabled } = useLocalParticipant()
  const { notify } = useCall()
  const track = microphoneTrack?.track as LocalAudioTrack | undefined
  useEffect(() => {
    if (!track || isMicrophoneEnabled) return
    let clone: MediaStreamTrack | null = null
    let ctx: AudioContext | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let loud = 0
    let lastShown = 0
    try {
      // The microphone itself: a noise filter's output is silent while muted.
      clone = sourceTrack(track).clone()
      clone.enabled = true
      ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(new MediaStream([clone])).connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        const rms = Math.sqrt(sum / buf.length)
        loud = rms > 0.035 ? loud + 1 : Math.max(0, loud - 1)
        if (loud >= 6 && Date.now() - lastShown > 30_000) {
          lastShown = Date.now()
          loud = 0
          notify(`You're muted. Press ${shortcut('D')} to talk.`, 'info')
        }
      }, 150)
    } catch {
      // No WebAudio: skip the hint.
    }
    return () => {
      if (timer) clearInterval(timer)
      clone?.stop()
      void ctx?.close().catch(() => undefined)
    }
  }, [track, isMicrophoneEnabled, notify])
}

/**
 * Say so when your mic gets muted without you pressing anything: usually a
 * host, but also a mic that was unplugged or taken by another app.
 */
function useHostMuteNotice(): void {
  const { localParticipant } = useLocalParticipant()
  const { notify, setSettingsOpen } = useCall()
  useEffect(() => {
    const onMuted = (pub: TrackPublication): void => {
      if (pub.source !== Track.Source.Microphone) return
      if (Date.now() - userMicToggle.at < 2000) return
      if (pub.track && sourceTrack(pub.track).readyState === 'ended') {
        notify('Your microphone disconnected. Choose another one in Settings.', 'warn', {
          label: 'Settings',
          run: () => setSettingsOpen(true),
        })
        return
      }
      notify(`You've been muted. Press ${shortcut('D')} to unmute.`, 'info')
    }
    localParticipant.on(ParticipantEvent.TrackMuted, onMuted)
    return () => {
      localParticipant.off(ParticipantEvent.TrackMuted, onMuted)
    }
  }, [localParticipant, notify, setSettingsOpen])
}
