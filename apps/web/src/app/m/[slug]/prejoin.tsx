'use client'

import { useEffect, useRef, useState } from 'react'
import { useTrackVolume } from '@livekit/components-react'
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from 'livekit-client'
import { brandVars, type MeetingBrand } from './_lib/brand'
import { useBlurSupported, useTrackBlur } from './_lib/blur'
import {
  classifyMediaError,
  deviceLabel,
  mediaProblemCopy,
  sourceTrack,
  useDeviceList,
  useSpeakerSelectable,
  type MediaProblem,
} from './_lib/devices'
import {
  audioConstraints,
  setPrefs as savePrefs,
  useMeetPrefs,
  type NoiseMode,
  type Quality,
} from './_lib/prefs'
import { maxCameraHeight, QUALITY, QUALITY_ORDER } from './_lib/quality'
import { playTestTone } from './_lib/sounds'
import { BrandMark } from './brand-mark'
import {
  ChevronDownIcon,
  MicIcon,
  MicOffIcon,
  PlayIcon,
  SparklesIcon,
  SpeakerIcon,
  VideoIcon,
  VideoOffIcon,
} from './icons'
import { cx, IconButton, LevelMeter, MenuItem, MenuLabel, Popover } from './ui'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export interface JoinDetails {
  name: string
  email: string
  audioEnabled: boolean
  videoEnabled: boolean
  website: string
}

export type PreJoinPhase = 'form' | 'waiting' | 'denied'

/** The mic/camera someone would join with right now, and the preview's live tracks. */
export interface PreviewMedia {
  audioEnabled: boolean
  videoEnabled: boolean
  audioTrack: LocalAudioTrack | null
  videoTrack: LocalVideoTrack | null
}

// ---------------------------------------------------------------------------
// Preview media: separate mic and camera tracks, so switching one never
// restarts the other, with device + quality changes applied in place.
// ---------------------------------------------------------------------------

function usePreviewMedia(opts: {
  audioOn: boolean
  videoOn: boolean
  audioId: string | null
  videoId: string | null
  quality: Quality
  blur: boolean
  noise: NoiseMode
  /** Tracks the call has taken over: never stop those here. */
  isHandedOver: (track: object) => boolean
}) {
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null)
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | null>(null)
  const [audioError, setAudioError] = useState<MediaProblem | null>(null)
  const [videoError, setVideoError] = useState<MediaProblem | null>(null)
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(opts)
  latest.current = opts
  const appliedQuality = useRef<Quality>(opts.quality)
  const release = (t: { stop: () => unknown } | null): void => {
    if (t && !latest.current.isHandedOver(t)) t.stop()
  }

  // The mic is reopened (not switched in place) when the device changes, so the
  // level meter follows the new microphone.
  useEffect(() => {
    if (!opts.audioOn) {
      setAudioError(null)
      return
    }
    let cancelled = false
    let made: LocalAudioTrack | null = null
    // Captured exactly as the call would, so the call can take this track over
    // (no second permission prompt on phones).
    createLocalAudioTrack({
      ...(opts.audioId ? { deviceId: opts.audioId } : {}),
      ...audioConstraints(opts.noise),
    })
      .then((t) => {
        if (cancelled) return t.stop()
        made = t
        setAudioTrack(t)
        setAudioError(null)
      })
      .catch((e) => !cancelled && setAudioError(classifyMediaError(e)))
    return () => {
      cancelled = true
      release(made)
      setAudioTrack(null)
    }
  }, [opts.audioOn, opts.audioId, opts.noise, attempt])

  useEffect(() => {
    if (!opts.videoOn) {
      setVideoError(null)
      return
    }
    let cancelled = false
    let made: LocalVideoTrack | null = null
    const { videoId, quality } = latest.current
    appliedQuality.current = quality
    createLocalVideoTrack({
      ...(videoId ? { deviceId: videoId } : {}),
      resolution: QUALITY[quality].preset.resolution,
    })
      .then((t) => {
        if (cancelled) return t.stop()
        made = t
        setVideoTrack(t)
        setVideoError(null)
      })
      .catch((e) => !cancelled && setVideoError(classifyMediaError(e)))
    return () => {
      cancelled = true
      release(made)
      setVideoTrack(null)
    }
  }, [opts.videoOn, attempt])

  // Switch camera or quality in place (deviceId is required, or the browser
  // may open its default camera instead; read it from the real camera, not a
  // blur processor's output).
  useEffect(() => {
    if (!videoTrack) return
    const current = sourceTrack(videoTrack).getSettings().deviceId
    const sameDevice = !opts.videoId || current === opts.videoId
    if (sameDevice && appliedQuality.current === opts.quality) return
    appliedQuality.current = opts.quality
    videoTrack
      .restartTrack({
        deviceId: opts.videoId ?? current,
        resolution: QUALITY[opts.quality].preset.resolution,
      })
      .catch((e) => setVideoError(classifyMediaError(e)))
  }, [videoTrack, opts.videoId, opts.quality])

  // If blur can't run here, switch it back off so the preview (and the call)
  // match the toggle.
  useTrackBlur(videoTrack, opts.blur, () => savePrefs({ blur: false }))

  return {
    audioTrack,
    videoTrack,
    audioError,
    videoError,
    retry: () => setAttempt((n) => n + 1),
  }
}

function PreviewVideo({ track, mirror }: { track: LocalVideoTrack; mirror: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])
  return (
    <video
      ref={ref}
      muted
      playsInline
      autoPlay
      className={cx('h-full w-full object-cover', mirror && '-scale-x-100')}
    />
  )
}

function MicMeter({ track }: { track: LocalAudioTrack }) {
  const level = useTrackVolume(track)
  return <LevelMeter level={level} />
}

// ---------------------------------------------------------------------------
// Device chips (a pill that opens a picker)
// ---------------------------------------------------------------------------

function Chip({
  icon,
  label,
  menuLabel,
  children,
  trailing,
}: {
  icon: React.ReactNode
  label: string
  menuLabel: string
  children: (close: () => void) => React.ReactNode
  trailing?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="relative flex min-w-0 items-center">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 max-w-[15rem] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ink transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--room-accent-ring)]"
      >
        <span className="shrink-0 text-muted">{icon}</span>
        <span className="truncate">{label}</span>
        <ChevronDownIcon size={14} className="shrink-0 text-faint" />
      </button>
      {trailing}
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        side="top"
        align="start"
        label={menuLabel}
      >
        {children(() => setOpen(false))}
      </Popover>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function PreJoinScreen({
  roomName,
  brand,
  isHost,
  lobbyEnabled,
  me,
  phase,
  busy,
  error,
  onJoin,
  onCancelWaiting,
  onAskAgain,
  onMediaChange,
  isHandedOver,
}: {
  roomName: string
  brand: MeetingBrand
  isHost: boolean
  lobbyEnabled: boolean
  me: { name: string; email: string } | null
  phase: PreJoinPhase
  busy: boolean
  error: string | null
  onJoin: (details: JoinDetails) => void
  onCancelWaiting: () => void
  onAskAgain: () => void
  /**
   * The mic/camera the person would join with right now. Reported live, so being
   * let in from the lobby uses what they have on *then*, not at "Ask to join".
   */
  onMediaChange: (media: PreviewMedia) => void
  /** Whether the call has taken over a preview track (so leaving here keeps it running). */
  isHandedOver: (track: object) => boolean
}) {
  const [prefs, setPrefs] = useMeetPrefs()
  const [audioOn, setAudioOn] = useState(true)
  const [videoOn, setVideoOn] = useState(true)
  const [name, setName] = useState(me?.name ?? '')
  const [email, setEmail] = useState(me?.email ?? '')
  const [website, setWebsite] = useState('') // honeypot
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const speakerSelectable = useSpeakerSelectable()
  const blurSupported = useBlurSupported()

  // Details remembered from a previous call or comment (guests only).
  useEffect(() => {
    if (me) return
    try {
      const n = localStorage.getItem('lmsy-comment-name')
      const e = localStorage.getItem('lmsy-comment-email')
      if (n) setName((cur) => cur || n)
      if (e) setEmail((cur) => cur || e)
    } catch {
      // storage blocked
    }
  }, [me])

  const media = usePreviewMedia({
    audioOn,
    videoOn,
    audioId: prefs.audioInputId,
    videoId: prefs.videoInputId,
    quality: prefs.quality,
    blur: prefs.blur,
    noise: prefs.noise,
    isHandedOver,
  })

  // Re-list once capture starts: labels and ids only appear after permission.
  const mics = useDeviceList('audioinput', true, media.audioTrack)
  const cams = useDeviceList('videoinput', true, media.videoTrack)
  const speakers = useDeviceList('audiooutput', speakerSelectable, media.audioTrack)

  const joinAudio = audioOn && !!media.audioTrack
  const joinVideo = videoOn && !!media.videoTrack
  useEffect(() => {
    onMediaChange({
      audioEnabled: joinAudio,
      videoEnabled: joinVideo,
      audioTrack: joinAudio ? media.audioTrack : null,
      videoTrack: joinVideo ? media.videoTrack : null,
    })
  }, [joinAudio, joinVideo, media.audioTrack, media.videoTrack, onMediaChange])

  const activeMicId =
    prefs.audioInputId ?? (media.audioTrack && sourceTrack(media.audioTrack).getSettings().deviceId) ?? ''
  const activeCamId =
    prefs.videoInputId ?? (media.videoTrack && sourceTrack(media.videoTrack).getSettings().deviceId) ?? ''
  const micIndex = Math.max(0, mics.findIndex((d) => d.deviceId === activeMicId))
  const camIndex = Math.max(0, cams.findIndex((d) => d.deviceId === activeCamId))
  // A saved speaker that's no longer plugged in falls back to the system default.
  const savedSpeaker = speakers.find((d) => d.deviceId === prefs.audioOutputId)
  const speakerId = savedSpeaker?.deviceId ?? null
  const speakerIndex = Math.max(
    0,
    speakers.findIndex((d) => d.deviceId === (speakerId ?? 'default')),
  )

  const maxHeight = media.videoTrack ? maxCameraHeight(sourceTrack(media.videoTrack)) : null
  const fhdSupported = maxHeight === null || maxHeight >= 1080

  const problem = mediaProblemCopy(videoOn ? media.videoError : null, audioOn ? media.audioError : null)
  const nameOk = name.trim().length > 0
  const emailOk = isHost || EMAIL_RE.test(email.trim())
  const canSubmit = nameOk && emailOk && !busy

  function submit(withCamera = true): void {
    if (!canSubmit) return
    try {
      if (!me) {
        localStorage.setItem('lmsy-comment-name', name.trim())
        localStorage.setItem('lmsy-comment-email', email.trim())
      }
    } catch {
      // storage blocked
    }
    // "Join without camera" turns the camera off here too, so the live media
    // state (used if they're let in from the lobby later) matches the choice.
    if (!withCamera) setVideoOn(false)
    onJoin({
      name: name.trim(),
      email: email.trim(),
      // Only join with devices the preview proved work; a failing camera would
      // just fail again inside the call.
      audioEnabled: audioOn && !!media.audioTrack,
      videoEnabled: withCamera && videoOn && !!media.videoTrack,
      website,
    })
  }

  async function testSpeaker(): Promise<void> {
    setTesting(true)
    setTestError(null)
    try {
      await playTestTone(speakerId)
    } catch {
      setTestError("Couldn't play through that speaker.")
    } finally {
      setTesting(false)
    }
  }

  const cta = busy
    ? 'Joining…'
    : isHost
      ? 'Join as host'
      : lobbyEnabled
        ? 'Ask to join'
        : 'Join call'

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-6 pt-5 sm:px-6 sm:pt-8"
      style={brandVars(brand.accent)}
    >
      <BrandMark brand={brand} />

      <div className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        {/* Preview */}
        <section aria-label="Camera and microphone check" className="rise min-w-0">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-[#101019] ring-1 ring-white/10 sm:aspect-video">
            {videoOn && media.videoTrack ? (
              <PreviewVideo track={media.videoTrack} mirror={prefs.mirror} />
            ) : (
              <div className="grid h-full place-items-center">
                <span className="grid h-20 w-20 place-items-center rounded-full bg-[var(--room-accent-soft)] font-display text-3xl font-semibold text-ink">
                  {(name.trim() || '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {problem && (
              <div className="absolute inset-0 grid place-items-center bg-black/65 p-6 text-center backdrop-blur-sm">
                <div className="max-w-sm">
                  <p className="text-sm leading-relaxed text-ink">{problem}</p>
                  <button
                    type="button"
                    onClick={media.retry}
                    className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white/15"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {audioOn && media.audioTrack && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 backdrop-blur">
                <MicIcon size={14} className="text-ink" />
                <MicMeter track={media.audioTrack} />
              </div>
            )}

            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
              <IconButton
                label={audioOn ? 'Turn off microphone' : 'Turn on microphone'}
                tone={audioOn ? 'default' : 'off'}
                aria-pressed={!audioOn}
                onClick={() => setAudioOn((v) => !v)}
                className="backdrop-blur"
              >
                {audioOn ? <MicIcon /> : <MicOffIcon />}
              </IconButton>
              <IconButton
                label={videoOn ? 'Turn off camera' : 'Turn on camera'}
                tone={videoOn ? 'default' : 'off'}
                aria-pressed={!videoOn}
                onClick={() => setVideoOn((v) => !v)}
                className="backdrop-blur"
              >
                {videoOn ? <VideoIcon /> : <VideoOffIcon />}
              </IconButton>
              {blurSupported && (
                <IconButton
                  label={prefs.blur ? 'Turn off background blur' : 'Blur my background'}
                  active={prefs.blur}
                  aria-pressed={prefs.blur}
                  onClick={() => setPrefs({ blur: !prefs.blur })}
                  className="backdrop-blur"
                >
                  <SparklesIcon />
                </IconButton>
              )}
            </div>
          </div>

          {/* Device pickers */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip
              icon={<MicIcon size={16} />}
              label={mics.length ? deviceLabel(mics[micIndex], micIndex, 'Microphone') : 'Microphone'}
              menuLabel="Choose a microphone"
            >
              {(close) => (
                <>
                  <MenuLabel>Microphone</MenuLabel>
                  {mics.length === 0 && <p className="px-3 py-2 text-faint">No microphones found</p>}
                  {mics.map((d, i) => (
                    <MenuItem
                      key={d.deviceId}
                      selected={i === micIndex}
                      onSelect={() => {
                        setPrefs({ audioInputId: d.deviceId })
                        close()
                      }}
                    >
                      {deviceLabel(d, i, 'Microphone')}
                    </MenuItem>
                  ))}
                </>
              )}
            </Chip>

            {speakerSelectable && speakers.length > 0 && (
              <Chip
                icon={<SpeakerIcon size={16} />}
                label={deviceLabel(speakers[speakerIndex], speakerIndex, 'Speaker')}
                menuLabel="Choose a speaker"
                trailing={
                  <button
                    type="button"
                    onClick={() => void testSpeaker()}
                    disabled={testing}
                    className="ml-1 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted transition hover:bg-white/[0.06] hover:text-ink disabled:opacity-60"
                  >
                    <PlayIcon size={12} />
                    {testing ? 'Playing…' : 'Test'}
                  </button>
                }
              >
                {(close) => (
                  <>
                    <MenuLabel>Speaker</MenuLabel>
                    {speakers.map((d, i) => (
                      <MenuItem
                        key={d.deviceId}
                        selected={i === speakerIndex}
                        onSelect={() => {
                          setPrefs({ audioOutputId: d.deviceId })
                          close()
                        }}
                      >
                        {deviceLabel(d, i, 'Speaker')}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Chip>
            )}

            <Chip
              icon={<VideoIcon size={16} />}
              label={cams.length ? deviceLabel(cams[camIndex], camIndex, 'Camera') : 'Camera'}
              menuLabel="Choose a camera"
            >
              {(close) => (
                <>
                  <MenuLabel>Camera</MenuLabel>
                  {cams.length === 0 && <p className="px-3 py-2 text-faint">No cameras found</p>}
                  {cams.map((d, i) => (
                    <MenuItem
                      key={d.deviceId}
                      selected={i === camIndex}
                      onSelect={() => {
                        setPrefs({ videoInputId: d.deviceId })
                        close()
                      }}
                    >
                      {deviceLabel(d, i, 'Camera')}
                    </MenuItem>
                  ))}
                </>
              )}
            </Chip>

            <Chip
              icon={<span className="text-[11px] font-bold tracking-tight">HD</span>}
              label={QUALITY[prefs.quality].label}
              menuLabel="Video quality"
            >
              {(close) => (
                <>
                  <MenuLabel>Video quality</MenuLabel>
                  {QUALITY_ORDER.map((q) => (
                    <MenuItem
                      key={q}
                      selected={prefs.quality === q}
                      disabled={q === 'fhd' && !fhdSupported}
                      hint={
                        q === 'fhd' && !fhdSupported
                          ? `Your camera supports up to ${maxHeight}p`
                          : QUALITY[q].detail
                      }
                      onSelect={() => {
                        setPrefs({ quality: q })
                        close()
                      }}
                    >
                      {QUALITY[q].label}
                    </MenuItem>
                  ))}
                </>
              )}
            </Chip>
          </div>
          {!speakerSelectable && (
            <p className="mt-3 text-xs text-faint">
              Sound plays through your device&apos;s current output. You can change it in your system
              settings.
            </p>
          )}
          {testError && <p className="mt-2 text-xs text-amber-200">{testError}</p>}
        </section>

        {/* Details / lobby */}
        <section className="rise min-w-0" style={{ animationDelay: '80ms' }}>
          <p className="eyebrow">{isHost ? "You're hosting" : `Video call with ${brand.name}`}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {roomName}
          </h1>

          {phase === 'waiting' ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-3">
                <span
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-[var(--room-accent-ring)] motion-reduce:animate-none"
                  aria-hidden
                />
                <p className="font-medium text-ink">Asking to join…</p>
              </div>
              <p className="mt-2 text-sm text-muted">
                The host will let you in soon. You can keep checking your camera and mic.
              </p>
              <button
                type="button"
                onClick={onCancelWaiting}
                className="mt-4 rounded-full border border-white/10 px-4 py-2 text-sm text-muted transition hover:text-ink"
              >
                Cancel request
              </button>
            </div>
          ) : phase === 'denied' ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="font-medium text-ink">The host didn&apos;t let you in</p>
              <p className="mt-2 text-sm text-muted">
                If you think this is a mistake, you can ask again.
              </p>
              <button
                type="button"
                onClick={onAskAgain}
                className="mt-4 rounded-full border border-white/10 px-4 py-2 text-sm text-ink transition hover:bg-white/[0.06]"
              >
                Ask again
              </button>
            </div>
          ) : (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <p className="text-muted">
                {isHost
                  ? "Guests waiting to join will show up once you're in."
                  : 'Check how you look and sound, then join. Nothing to install.'}
              </p>
              <div className="mt-6 space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-faint">Your name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    autoComplete="name"
                    placeholder="Your name"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-base text-ink placeholder:text-faint focus:border-[var(--room-accent-ring)] focus:outline-none sm:text-sm"
                  />
                </label>
                {!isHost && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-faint">Your email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={200}
                      autoComplete="email"
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-base text-ink placeholder:text-faint focus:border-[var(--room-accent-ring)] focus:outline-none sm:text-sm"
                    />
                    <span className="mt-1.5 block text-xs text-faint">Only the host sees your email.</span>
                  </label>
                )}
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
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-6 h-12 w-full rounded-xl bg-[var(--room-accent)] text-base font-semibold text-[var(--room-accent-fg)] shadow-[0_18px_40px_-18px_var(--room-accent)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--room-accent-ring)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cta}
              </button>
              {videoOn && (
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => submit(false)}
                  className="mt-2 w-full rounded-xl py-2.5 text-sm text-muted transition hover:text-ink disabled:opacity-40"
                >
                  Join without camera
                </button>
              )}
              {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
              {!isHost && !emailOk && email.trim() && (
                <p className="mt-3 text-sm text-amber-200">Please enter a valid email.</p>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
