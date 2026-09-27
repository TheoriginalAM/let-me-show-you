'use client'

import { useEffect, useRef, useState } from 'react'
import {
  useLocalParticipant,
  useRoomContext,
  useTrackVolume,
  VideoTrack,
} from '@livekit/components-react'
import { Track, type LocalAudioTrack, type LocalVideoTrack, type Room } from 'livekit-client'
import {
  BLUR_FAILED_COPY,
  changeCameraQuality,
  switchDevice,
  useActiveDevice,
  useKrispSupported,
} from './_lib/call-media'
import { useBlurSupported } from './_lib/blur'
import {
  deviceLabel,
  sourceTrack,
  useDeviceList,
  useIsRearCamera,
  useSpeakerSelectable,
} from './_lib/devices'
import { useMeetPrefs, type NoiseMode } from './_lib/prefs'
import { maxCameraHeight, QUALITY, QUALITY_ORDER } from './_lib/quality'
import { hasKeyboard, shortcut } from './_lib/shortcuts'
import { playTestTone } from './_lib/sounds'
import { useCall } from './call-context'
import { CloseIcon, PlayIcon } from './icons'
import { cx, LevelMeter, Select, Switch } from './ui'

type Tab = 'audio' | 'video' | 'general'

const shortcuts = (): [string, string][] => [
  ['Microphone on/off', shortcut('D')],
  ['Camera on/off', shortcut('E')],
  ['Close menus and panels', 'Esc'],
]

/** Switch a device from a settings list, and say so if it didn't work. */
async function pick(
  room: Room,
  kind: MediaDeviceKind,
  id: string,
  notify: (text: string, tone?: 'warn') => void,
): Promise<void> {
  if (!(await switchDevice(room, kind, id))) {
    notify("Couldn't switch to that device. It may be in use by another app.", 'warn')
  }
}

function MicLevel({ track }: { track: LocalAudioTrack }) {
  const level = useTrackVolume(track)
  return <LevelMeter level={level} bars={16} />
}

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useCall()
  const ref = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<Tab>('audio')

  // Native <dialog>: focus trap, Esc to close, focus returns on close.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (settingsOpen && !d.open) d.showModal()
    if (!settingsOpen && d.open) d.close()
  }, [settingsOpen])

  return (
    <dialog
      ref={ref}
      onClose={() => setSettingsOpen(false)}
      onClick={(e) => e.target === ref.current && setSettingsOpen(false)}
      aria-labelledby="settings-title"
      className="m-auto w-[min(46rem,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-3xl border border-white/10 bg-[#0f0f17] p-0 text-ink shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      {settingsOpen && (
        <div className="relative flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col sm:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex gap-1 border-b border-white/[0.07] p-3 sm:w-44 sm:flex-col sm:border-b-0 sm:border-r"
          >
            <h2 id="settings-title" className="hidden px-3 pb-2 pt-1 font-display text-lg font-semibold sm:block">
              Settings
            </h2>
            {(['audio', 'video', 'general'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={cx(
                  'rounded-xl px-3 py-2 text-left text-sm font-medium capitalize transition',
                  tab === t ? 'bg-[var(--room-accent-soft)] text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
              className="ml-auto grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-white/[0.07] hover:text-ink sm:hidden"
            >
              <CloseIcon size={18} />
            </button>
          </nav>
          {/* Outside the scrolling area, so it stays put on short (landscape) screens. */}
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
            className="absolute right-4 top-4 z-10 hidden h-9 w-9 place-items-center rounded-full bg-[#0f0f17]/80 text-muted hover:bg-white/[0.07] hover:text-ink sm:grid"
          >
            <CloseIcon size={18} />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {tab === 'audio' && <AudioTab />}
            {tab === 'video' && <VideoTab />}
            {tab === 'general' && <GeneralTab />}
          </div>
        </div>
      )}
    </dialog>
  )
}

function AudioTab() {
  const room = useRoomContext()
  const { notify } = useCall()
  const { microphoneTrack } = useLocalParticipant()
  const [prefs, setPrefs] = useMeetPrefs()
  const speakerSelectable = useSpeakerSelectable()
  const krisp = useKrispSupported()
  const mics = useDeviceList('audioinput')
  const speakers = useDeviceList('audiooutput', speakerSelectable)
  const activeMic = useActiveDevice('audioinput')
  const activeSpeaker = useActiveDevice('audiooutput')
  const [testing, setTesting] = useState(false)
  const micTrack = microphoneTrack?.track as LocalAudioTrack | undefined

  async function test(): Promise<void> {
    setTesting(true)
    try {
      await playTestTone(activeSpeaker ?? prefs.audioOutputId)
    } catch {
      notify("Couldn't play through that speaker.", 'warn')
    } finally {
      setTesting(false)
    }
  }

  const noiseOptions: { id: NoiseMode; label: string; hint: string }[] = [
    { id: 'standard', label: 'Standard', hint: 'Filters steady background noise' },
    ...(krisp
      ? [{ id: 'enhanced' as NoiseMode, label: 'Enhanced', hint: 'Removes voices and noise around you' }]
      : []),
    { id: 'off', label: 'Off', hint: 'Best for music' },
  ]

  return (
    <div className="space-y-6">
      <h3 className="font-display text-lg font-semibold">Audio</h3>
      <div>
        <Select
          label="Microphone"
          value={activeMic ?? ''}
          options={mics.map((d, i) => ({ value: d.deviceId, label: deviceLabel(d, i, 'Microphone') }))}
          onChange={(id) => void pick(room, 'audioinput', id, notify)}
        />
        <div className="mt-3 flex items-center gap-3">
          {micTrack && !microphoneTrack?.isMuted ? (
            <>
              <MicLevel track={micTrack} />
              <span className="text-xs text-faint">Speak to test. The bar should move.</span>
            </>
          ) : (
            <span className="text-xs text-faint">Turn your microphone on to test it.</span>
          )}
        </div>
      </div>

      <div>
        {speakerSelectable && speakers.length > 0 ? (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Select
                label="Speaker"
                value={activeSpeaker ?? 'default'}
                options={speakers.map((d, i) => ({ value: d.deviceId, label: deviceLabel(d, i, 'Speaker') }))}
                onChange={(id) => void pick(room, 'audiooutput', id, notify)}
              />
            </div>
            <button
              type="button"
              disabled={testing}
              onClick={() => void test()}
              className="flex h-[46px] shrink-0 items-center gap-2 rounded-xl bg-white/[0.06] px-4 text-sm text-ink transition hover:bg-white/[0.1] disabled:opacity-60"
            >
              <PlayIcon size={12} /> {testing ? 'Playing…' : 'Test'}
            </button>
          </div>
        ) : (
          <>
            <span className="mb-1.5 block text-xs font-medium text-faint">Speaker</span>
            <p className="text-sm text-muted">
              Sound plays through your device&apos;s current output. You can change it in your system settings.
            </p>
          </>
        )}
      </div>

      <div>
        <span className="mb-2 block text-xs font-medium text-faint">Noise reduction</span>
        <div role="radiogroup" aria-label="Noise reduction" className="grid gap-2 sm:grid-cols-3">
          {noiseOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={prefs.noise === o.id}
              onClick={() => setPrefs({ noise: o.id })}
              className={cx(
                'rounded-xl border px-3 py-2.5 text-left transition',
                prefs.noise === o.id
                  ? 'border-[var(--room-accent-ring)] bg-[var(--room-accent-soft)]'
                  : 'border-white/10 hover:bg-white/[0.04]',
              )}
            >
              <span className="block text-sm font-medium text-ink">{o.label}</span>
              <span className="block text-xs text-faint">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function VideoTab() {
  const room = useRoomContext()
  const { notify } = useCall()
  const { cameraTrack, localParticipant } = useLocalParticipant()
  const [prefs, setPrefs] = useMeetPrefs()
  const blurSupported = useBlurSupported()
  const cams = useDeviceList('videoinput')
  const activeCam = useActiveDevice('videoinput')
  const switching = useRef(false)
  const camTrack = cameraTrack?.track as LocalVideoTrack | undefined
  const rear = useIsRearCamera(camTrack)
  const maxHeight = maxCameraHeight(camTrack ? sourceTrack(camTrack) : undefined)
  const fhdSupported = maxHeight === null || maxHeight >= 1080
  const showPreview = cameraTrack && camTrack && !cameraTrack.isMuted

  async function pickQuality(q: (typeof QUALITY_ORDER)[number]): Promise<void> {
    if (q === prefs.quality || switching.current) return
    switching.current = true
    try {
      if ((await changeCameraQuality(room, q)) === 'blur-failed') notify(BLUR_FAILED_COPY, 'warn')
      else notify(`Video quality set to ${QUALITY[q].label}`, 'success')
    } catch {
      notify("Couldn't change video quality. Try turning your camera off and on.", 'error')
    } finally {
      switching.current = false
    }
  }

  return (
    <div className="space-y-6">
      <h3 className="font-display text-lg font-semibold">Video</h3>
      <Select
        label="Camera"
        value={activeCam ?? ''}
        options={cams.map((d, i) => ({ value: d.deviceId, label: deviceLabel(d, i, 'Camera', cams) }))}
        onChange={(id) => void pick(room, 'videoinput', id, notify)}
      />
      <div className="aspect-video overflow-hidden rounded-2xl bg-[#101019] ring-1 ring-white/10">
        {showPreview ? (
          <VideoTrack
            trackRef={{ participant: localParticipant, source: Track.Source.Camera, publication: cameraTrack }}
            className={cx('h-full w-full object-cover', prefs.mirror && !rear && '-scale-x-100')}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-faint">Your camera is off</div>
        )}
      </div>

      <div>
        <span className="mb-2 block text-xs font-medium text-faint">Quality</span>
        <div role="radiogroup" aria-label="Video quality" className="grid gap-2 sm:grid-cols-3">
          {QUALITY_ORDER.map((q) => {
            const disabled = q === 'fhd' && !fhdSupported
            return (
              <button
                key={q}
                type="button"
                role="radio"
                aria-checked={prefs.quality === q}
                disabled={disabled}
                onClick={() => void pickQuality(q)}
                className={cx(
                  'rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40',
                  prefs.quality === q
                    ? 'border-[var(--room-accent-ring)] bg-[var(--room-accent-soft)]'
                    : 'border-white/10 hover:bg-white/[0.04]',
                )}
              >
                <span className="block text-sm font-medium text-ink">{QUALITY[q].label}</span>
                <span className="block text-xs text-faint">
                  {q === 'fhd' && !fhdSupported ? `Your camera supports up to ${maxHeight}p` : QUALITY[q].detail}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="divide-y divide-white/[0.06]">
        {blurSupported && (
          <Switch checked={prefs.blur} onChange={(v) => setPrefs({ blur: v })} label="Blur my background" hint="Uses a little more battery" />
        )}
        <Switch checked={prefs.mirror} onChange={(v) => setPrefs({ mirror: v })} label="Mirror my video" hint="Only you see it mirrored" />
      </div>
    </div>
  )
}

function GeneralTab() {
  const [prefs, setPrefs] = useMeetPrefs()
  return (
    <div className="space-y-6">
      <h3 className="font-display text-lg font-semibold">General</h3>
      <div className="divide-y divide-white/[0.06]">
        <Switch checked={prefs.hideSelf} onChange={(v) => setPrefs({ hideSelf: v })} label="Hide my own video" hint="Others still see you" />
        <Switch checked={prefs.sounds} onChange={(v) => setPrefs({ sounds: v })} label="Play sounds" hint="When someone asks to join" />
      </div>
      {hasKeyboard() && (
        <div>
          <span className="mb-2 block text-xs font-medium text-faint">Keyboard shortcuts</span>
          <dl className="divide-y divide-white/[0.06] rounded-xl border border-white/10">
            {shortcuts().map(([what, keys]) => (
              <div key={what} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <dt className="text-muted">{what}</dt>
                <dd className="font-mono text-xs text-ink">{keys}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
