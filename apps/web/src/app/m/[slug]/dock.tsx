'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  useIsRecording,
  useLocalParticipant,
  useParticipantAttribute,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import type { LocalVideoTrack, ScreenShareCaptureOptions } from 'livekit-client'
import { useBlurSupported } from './_lib/blur'
import {
  BLUR_FAILED_COPY,
  changeCameraQuality,
  setCameraOn,
  switchDevice,
  useActiveDevice,
} from './_lib/call-media'
import {
  cameraSide,
  deviceLabel,
  isRearCamera,
  sourceTrack,
  useDeviceList,
  useSpeakerSelectable,
} from './_lib/devices'
import { withShortcut } from './_lib/shortcuts'
import { useMeetPrefs } from './_lib/prefs'
import { maxCameraHeight, QUALITY, QUALITY_ORDER } from './_lib/quality'
import {
  endCallForEveryone,
  muteEveryone,
  setHand,
  setLobbyDuringCall,
  startRecording,
  stopRecording,
} from './actions'
import { useCall } from './call-context'
import {
  ChatIcon,
  ChevronUpIcon,
  FullscreenIcon,
  GridIcon,
  HandIcon,
  LeaveIcon,
  LinkIcon,
  LockIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  RecordIcon,
  SettingsIcon,
  ShareIcon,
  ShareStopIcon,
  SmileIcon,
  SparklesIcon,
  SpotlightIcon,
  StopIcon,
  SwitchCameraIcon,
  UsersIcon,
  VideoIcon,
  VideoOffIcon,
} from './icons'
import { REACTIONS } from './stage'
import { cx, IconButton, MenuDivider, MenuItem, MenuLabel, Popover, Switch } from './ui'

/** When the user last toggled their own mic (to tell self-mutes from host mutes). */
export const userMicToggle = { at: 0 }

// Screen share tuned for design/UI review: crisp text, don't offer this tab
// itself, let people switch tabs mid-share, and include tab/system audio.
const SHARE_OPTIONS: ScreenShareCaptureOptions = {
  audio: true,
  contentHint: 'detail',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
  systemAudio: 'include',
}

function useCanShareScreen(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    setOk(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia)
  }, [])
  return ok
}

// The full bar needs about 800px (the 18px root font makes controls wide), so
// below that secondary controls move into More. (Media queries use 16px rems.)
/** Full screen for the whole page (iPhones only allow it for videos). */
function useCanFullscreen(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    setOk(typeof document !== 'undefined' && !!document.fullscreenEnabled)
  }, [])
  return ok
}

function Divider() {
  return <span className="mx-0.5 hidden h-6 w-px bg-white/10 min-[50rem]:block" aria-hidden />
}

/** A toggle with a caret that opens a menu (device choices etc.). */
function SplitButton({
  children,
  menuLabel,
  menu,
}: {
  children: ReactNode
  menuLabel: string
  menu: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="relative flex items-center">
      {children}
      <button
        type="button"
        aria-label={menuLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        // Wider on touch screens, so a thumb aimed at it doesn't hit the toggle.
        className="-ml-1 grid h-11 w-6 place-items-center rounded-r-full text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--room-accent-ring)] [@media(pointer:coarse)]:ml-0 [@media(pointer:coarse)]:w-9"
      >
        <ChevronUpIcon size={14} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} label={menuLabel}>
        {menu(() => setOpen(false))}
      </Popover>
    </div>
  )
}

/** An icon button that opens a popover. */
function MenuButton({
  label,
  icon,
  active,
  align = 'center',
  className,
  dot,
  menu,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  align?: 'start' | 'center' | 'end'
  className?: string
  /** Extra classes for a small "something new" dot; omit for none. */
  dot?: string
  menu: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className={cx('relative', className)}>
      <IconButton
        label={label}
        active={active || open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {dot && (
          <span
            className={cx('absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--room-accent-ring)] ring-2 ring-[#0e0e16]', dot)}
            aria-hidden
          />
        )}
      </IconButton>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} align={align} label={label}>
        {menu(() => setOpen(false))}
      </Popover>
    </div>
  )
}

export function Dock({ onReaction }: { onReaction: (emoji: string) => void }) {
  const room = useRoomContext()
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, cameraTrack } =
    useLocalParticipant()
  const participants = useParticipants()
  const isRecording = useIsRecording()
  const hand = useParticipantAttribute('hand', { participant: localParticipant })
  const call = useCall()
  const { role, slug, guestKey, notify, panel, togglePanel, chat, layout, setLayout, mediaStarting } = call
  // While the call is still switching the mic/camera on, show them as on.
  const micOn = isMicrophoneEnabled || mediaStarting.audio
  const camOn = isCameraEnabled || mediaStarting.video
  const isHost = role === 'host'
  const [prefs, setPrefs] = useMeetPrefs()
  const canShare = useCanShareScreen()
  const canFullscreen = useCanFullscreen()
  const speakerSelectable = useSpeakerSelectable()
  const blurSupported = useBlurSupported()

  const mics = useDeviceList('audioinput')
  const cams = useDeviceList('videoinput')
  const speakers = useDeviceList('audiooutput', speakerSelectable)
  const activeMic = useActiveDevice('audioinput')
  const activeCam = useActiveDevice('videoinput')
  const activeSpeaker = useActiveDevice('audiooutput')

  // Guards against double-clicks while something is in flight. Buttons stay
  // enabled (disabling one mid-press drops keyboard focus).
  const busy = useRef(new Set<string>())
  const once = async (key: string, fn: () => Promise<void>): Promise<void> => {
    if (busy.current.has(key)) return
    busy.current.add(key)
    try {
      await fn()
    } finally {
      busy.current.delete(key)
    }
  }
  const [recPending, setRecPending] = useState<null | 'starting' | 'stopping'>(null)
  const lastReaction = useRef(0)

  // Clear "Starting…/Stopping…" once LiveKit reports the change (or give up).
  useEffect(() => {
    if ((recPending === 'starting' && isRecording) || (recPending === 'stopping' && !isRecording)) {
      setRecPending(null)
    }
  }, [isRecording, recPending])
  useEffect(() => {
    if (!recPending) return
    const t = setTimeout(() => setRecPending(null), 45_000)
    return () => clearTimeout(t)
  }, [recPending])

  const camTrack = cameraTrack?.track as LocalVideoTrack | undefined
  const maxHeight = maxCameraHeight(camTrack ? sourceTrack(camTrack) : undefined)
  const fhdSupported = maxHeight === null || maxHeight >= 1080

  const toggleMic = (): Promise<void> =>
    once('mic', async () => {
      if (mediaStarting.audio) return // coming on: a toggle now would open a second mic
      userMicToggle.at = Date.now()
      try {
        await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
      } catch {
        notify("We couldn't start your microphone. Check your browser's permissions.", 'error')
      }
    })

  // The camera is also restarted by a quality change, so they share a guard.
  const toggleCam = (): Promise<void> =>
    once('cam', async () => {
      if (mediaStarting.video) return // coming on: a toggle now would open a second camera
      try {
        if ((await setCameraOn(room, !isCameraEnabled)) === 'blur-failed') notify(BLUR_FAILED_COPY, 'warn')
      } catch {
        notify("We couldn't start your camera. It may be in use by another app.", 'error')
      }
    })

  const toggleShare = (): Promise<void> =>
    once('share', async () => {
      try {
        await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, SHARE_OPTIONS)
      } catch {
        // Cancelling the browser's picker lands here too: nothing to report.
      }
    })

  const toggleHand = (): Promise<void> =>
    once('hand', async () => {
      const res = await setHand(slug, !hand, guestKey).catch(() => null)
      if (res && !res.ok) notify(res.error, 'warn')
    })

  const setQuality = (q: (typeof QUALITY_ORDER)[number]): Promise<void> =>
    once('cam', async () => {
      if (q === prefs.quality || mediaStarting.video) return
      notify(`Switching to ${QUALITY[q].label}…`)
      try {
        if ((await changeCameraQuality(room, q)) === 'blur-failed') notify(BLUR_FAILED_COPY, 'warn')
        else notify(`Video quality set to ${QUALITY[q].label}`, 'success')
      } catch {
        notify("Couldn't change video quality. Try turning your camera off and on.", 'error')
      }
    })

  /**
   * Flip between the front and back camera. Phones list several lenses per
   * side (Back, Back Ultra Wide, ...), so go by which way the lens faces and
   * prefer the plain one. A quick flip isn't saved as the default camera.
   */
  const switchCamera = (): Promise<void> =>
    once('cam', async () => {
      if (mediaStarting.video) return
      const current = cams.find((d) => d.deviceId === activeCam)
      const side = (current && cameraSide(current)) ?? (isRearCamera(camTrack) ? 'back' : 'front')
      const others = cams.filter((d) => d.deviceId !== activeCam && cameraSide(d) !== side && cameraSide(d) !== null)
      const next =
        others.find((d) => /^(front|back) camera$/i.test(d.label)) ??
        others[0] ??
        // No facing info (e.g. two webcams): just take the next one.
        cams[(cams.findIndex((d) => d.deviceId === activeCam) + 1) % cams.length]
      if (!next || next.deviceId === activeCam) return
      if (!(await switchDevice(room, 'videoinput', next.deviceId, false))) {
        notify("Couldn't switch camera. It may be in use by another app.", 'error')
      }
    })

  async function pickDevice(kind: MediaDeviceKind, id: string): Promise<void> {
    if (!(await switchDevice(room, kind, id))) {
      notify("Couldn't switch to that device. It may be in use by another app.", 'error')
    }
  }

  function react(i: number): void {
    const now = Date.now()
    if (now - lastReaction.current < 400) return
    lastReaction.current = now
    onReaction(REACTIONS[i])
    localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify({ i })), { reliable: true, topic: 'reaction' })
      .catch(() => undefined)
  }

  async function toggleRecording(): Promise<void> {
    if (recPending) return
    if (isRecording) {
      setRecPending('stopping')
      const res = await stopRecording(slug).catch(() => ({ ok: false as const, error: 'Try again.' }))
      if (res.ok) notify('Recording stopped. It will appear in your workspace in a minute or two.', 'success')
      else {
        setRecPending(null)
        notify(res.error, 'error')
      }
    } else {
      setRecPending('starting')
      const res = await startRecording(slug, Intl.DateTimeFormat().resolvedOptions().timeZone).catch(
        () => ({ ok: false as const, error: 'Could not start recording.' }),
      )
      if (!res.ok) {
        setRecPending(null)
        notify(res.error, 'error')
      }
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/m/${slug}`)
      notify('Meeting link copied', 'success')
    } catch {
      notify('Copy the link from your address bar instead.', 'warn')
    }
  }

  async function muteAll(): Promise<void> {
    const res = await muteEveryone(slug).catch(() => null)
    if (res?.ok) notify(res.muted ? `Muted ${res.muted} ${res.muted === 1 ? 'person' : 'people'}` : 'Everyone is already muted', 'success')
    else notify(res?.error ?? 'Could not mute everyone.', 'error')
  }

  async function setLobby(on: boolean): Promise<void> {
    call.setLobbyEnabled(on)
    const res = await setLobbyDuringCall(slug, on).catch(() => null)
    if (!res?.ok) {
      call.setLobbyEnabled(!on)
      notify('Could not change that setting.', 'error')
    } else notify(on ? 'Guests now ask to join' : 'Guests can now join directly', 'success')
  }

  function fullscreen(): void {
    const el = document.documentElement
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void el.requestFullscreen?.().catch(() => undefined)
  }

  const recLabel =
    recPending === 'starting'
      ? 'Starting recording…'
      : recPending === 'stopping'
        ? 'Stopping recording…'
        : isRecording
          ? 'Stop recording'
          : 'Start recording'

  // Shared menu sections (also reused in the phone "More" sheet).
  const layoutMenu = (close: () => void) => (
    <>
      <MenuLabel>Layout</MenuLabel>
      <MenuItem icon={<SparklesIcon size={16} />} selected={layout === 'auto'} onSelect={() => (setLayout('auto'), close())} hint="Big view for 1:1 calls and screen shares">
        Auto
      </MenuItem>
      <MenuItem icon={<GridIcon size={16} />} selected={layout === 'grid'} onSelect={() => (setLayout('grid'), close())}>
        Grid
      </MenuItem>
      <MenuItem icon={<SpotlightIcon size={16} />} selected={layout === 'speaker'} onSelect={() => (setLayout('speaker'), close())} hint="Whoever is talking, big">
        Speaker
      </MenuItem>
    </>
  )

  return (
    // z-30: the dock's menus must open above the stage (e.g. the floating
    // self-view), and backdrop-blur gives the bar its own stacking context.
    <div className="relative z-30 flex items-center justify-center gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <div
        role="toolbar"
        aria-label="Call controls"
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0e0e16]/90 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:gap-2 sm:p-2"
      >
        {/* Mic + devices */}
        <SplitButton
          menuLabel="Microphone and speaker options"
          menu={(close) => (
            <>
              <MenuLabel>Microphone</MenuLabel>
              {mics.length === 0 && <p className="px-3 py-2 text-faint">No microphones available</p>}
              {mics.map((d, i) => (
                <MenuItem key={d.deviceId} selected={d.deviceId === activeMic} onSelect={() => (void pickDevice('audioinput', d.deviceId), close())}>
                  {deviceLabel(d, i, 'Microphone')}
                </MenuItem>
              ))}
              {speakerSelectable && speakers.length > 0 && (
                <>
                  <MenuDivider />
                  <MenuLabel>Speaker</MenuLabel>
                  {speakers.map((d, i) => (
                    <MenuItem key={d.deviceId} selected={d.deviceId === (activeSpeaker ?? 'default')} onSelect={() => (void pickDevice('audiooutput', d.deviceId), close())}>
                      {deviceLabel(d, i, 'Speaker')}
                    </MenuItem>
                  ))}
                </>
              )}
              <MenuDivider />
              <MenuItem icon={<SettingsIcon size={16} />} onSelect={() => (call.setSettingsOpen(true), close())}>
                Audio settings…
              </MenuItem>
            </>
          )}
        >
          <IconButton
            label={
              mediaStarting.audio
                ? 'Microphone starting…'
                : withShortcut(`${isMicrophoneEnabled ? 'Turn off' : 'Turn on'} microphone`, 'D')
            }
            tone={micOn ? 'default' : 'off'}
            aria-busy={mediaStarting.audio || undefined}
            className={mediaStarting.audio ? 'motion-safe:animate-pulse' : undefined}
            onClick={() => void toggleMic()}
          >
            {micOn ? <MicIcon /> : <MicOffIcon />}
          </IconButton>
        </SplitButton>

        {/* Camera + devices + quality + blur */}
        <SplitButton
          menuLabel="Camera options"
          menu={(close) => (
            <>
              <MenuLabel>Camera</MenuLabel>
              {cams.length === 0 && <p className="px-3 py-2 text-faint">No cameras available</p>}
              {cams.map((d, i) => (
                <MenuItem key={d.deviceId} selected={d.deviceId === activeCam} onSelect={() => (void pickDevice('videoinput', d.deviceId), close())}>
                  {deviceLabel(d, i, 'Camera', cams)}
                </MenuItem>
              ))}
              <MenuDivider />
              <MenuLabel>Quality</MenuLabel>
              {QUALITY_ORDER.map((q) => (
                <MenuItem
                  key={q}
                  selected={prefs.quality === q}
                  disabled={q === 'fhd' && !fhdSupported}
                  hint={q === 'fhd' && !fhdSupported ? `Your camera supports up to ${maxHeight}p` : QUALITY[q].detail}
                  onSelect={() => (void setQuality(q), close())}
                >
                  {QUALITY[q].label}
                </MenuItem>
              ))}
              <MenuDivider />
              {blurSupported && (
                <MenuItem icon={<SparklesIcon size={16} />} selected={prefs.blur} onSelect={() => setPrefs({ blur: !prefs.blur })}>
                  Blur background
                </MenuItem>
              )}
              <MenuItem icon={<SettingsIcon size={16} />} onSelect={() => (call.setSettingsOpen(true), close())}>
                Video settings…
              </MenuItem>
            </>
          )}
        >
          <IconButton
            label={
              mediaStarting.video
                ? 'Camera starting…'
                : withShortcut(`${isCameraEnabled ? 'Turn off' : 'Turn on'} camera`, 'E')
            }
            tone={camOn ? 'default' : 'off'}
            aria-busy={mediaStarting.video || undefined}
            className={mediaStarting.video ? 'motion-safe:animate-pulse' : undefined}
            onClick={() => void toggleCam()}
          >
            {camOn ? <VideoIcon /> : <VideoOffIcon />}
          </IconButton>
        </SplitButton>

        <Divider />

        {canShare && (
          <IconButton
            label={isScreenShareEnabled ? 'Stop presenting' : 'Share your screen'}
            active={isScreenShareEnabled}
            onClick={() => void toggleShare()}
            className="hidden min-[50rem]:grid"
          >
            {isScreenShareEnabled ? <ShareStopIcon /> : <ShareIcon />}
          </IconButton>
        )}

        <MenuButton
          label="Send a reaction"
          icon={<SmileIcon />}
          className="hidden min-[50rem]:block"
          menu={() => (
            <div className="flex gap-1 p-1">
              {REACTIONS.map((e, i) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`React ${e}`}
                  onClick={() => react(i)}
                  className="grid h-11 w-11 place-items-center rounded-xl text-2xl transition hover:scale-110 hover:bg-white/[0.08]"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        />

        <IconButton
          label={hand ? 'Lower your hand' : 'Raise your hand'}
          active={!!hand}
          onClick={() => void toggleHand()}
          className="hidden min-[50rem]:grid"
        >
          <HandIcon />
        </IconButton>

        {isHost && (
          <IconButton
            label={recLabel}
            tone={isRecording ? 'off' : 'default'}
            aria-busy={recPending !== null}
            onClick={() => void toggleRecording()}
            className="hidden min-[50rem]:grid"
          >
            {isRecording ? <StopIcon /> : <RecordIcon className="text-red-400" />}
          </IconButton>
        )}

        <MenuButton
          label={chat.unread ? `More options (${chat.unread} new messages)` : 'More options'}
          icon={<MoreIcon />}
          align="end"
          // Chat lives in here on phones, so flag unread messages on the button.
          dot={chat.unread > 0 ? 'min-[50rem]:hidden' : undefined}
          menu={(close) => (
            <div className="max-h-[60vh] overflow-y-auto">
              {/* Phone-only shortcuts to things hidden from the compact bar */}
              <div className="min-[50rem]:hidden">
                {camOn && cams.length > 1 && (
                  // One tap between the front and back camera (the 'let me show you' move).
                  <MenuItem icon={<SwitchCameraIcon size={16} />} onSelect={() => (void switchCamera(), close())}>
                    Switch camera
                  </MenuItem>
                )}
                {canShare && (
                  <MenuItem icon={<ShareIcon size={16} />} onSelect={() => (void toggleShare(), close())}>
                    {isScreenShareEnabled ? 'Stop presenting' : 'Share your screen'}
                  </MenuItem>
                )}
                <MenuItem icon={<HandIcon size={16} />} onSelect={() => (void toggleHand(), close())}>
                  {hand ? 'Lower your hand' : 'Raise your hand'}
                </MenuItem>
                <MenuItem icon={<UsersIcon size={16} />} onSelect={() => (togglePanel('people'), close())}>
                  People ({participants.length})
                </MenuItem>
                <MenuItem icon={<ChatIcon size={16} />} onSelect={() => (togglePanel('chat'), close())}>
                  Chat{chat.unread ? ` (${chat.unread} new)` : ''}
                </MenuItem>
                {isHost && (
                  <MenuItem icon={<RecordIcon size={16} />} onSelect={() => (void toggleRecording(), close())}>
                    {recLabel}
                  </MenuItem>
                )}
                <div className="flex gap-1 px-1 py-1">
                  {REACTIONS.map((e, i) => (
                    <button key={e} type="button" aria-label={`React ${e}`} onClick={() => (react(i), close())} className="grid h-10 flex-1 place-items-center rounded-lg text-xl hover:bg-white/[0.08]">
                      {e}
                    </button>
                  ))}
                </div>
                <MenuDivider />
              </div>
              {layoutMenu(close)}
              <MenuDivider />
              <MenuItem icon={<SettingsIcon size={16} />} onSelect={() => (call.setSettingsOpen(true), close())}>
                Settings
              </MenuItem>
              <MenuItem icon={<LinkIcon size={16} />} onSelect={() => (void copyLink(), close())}>
                Copy meeting link
              </MenuItem>
              {canFullscreen && (
                <MenuItem icon={<FullscreenIcon size={16} />} onSelect={() => (fullscreen(), close())}>
                  Full screen
                </MenuItem>
              )}
              {isHost && (
                <>
                  <MenuDivider />
                  <MenuLabel>Host controls</MenuLabel>
                  <MenuItem icon={<MicOffIcon size={16} />} onSelect={() => (void muteAll(), close())}>
                    Mute everyone
                  </MenuItem>
                  <div className="px-3">
                    <Switch
                      checked={call.lobbyEnabled}
                      onChange={(on) => void setLobby(on)}
                      label="Guests must ask to join"
                      hint="New guests wait in the lobby"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        />

        <Divider />

        <LeaveButton />
      </div>

      {/* Panels */}
      <div className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-[#0e0e16]/90 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl min-[50rem]:flex min-[50rem]:p-2">
        <PanelButton label={`People (${participants.length})`} active={panel === 'people'} onClick={() => togglePanel('people')} badge={participants.length}>
          <UsersIcon />
        </PanelButton>
        <PanelButton label={chat.unread ? `Chat (${chat.unread} new)` : 'Chat'} active={panel === 'chat'} onClick={() => togglePanel('chat')} dot={chat.unread > 0}>
          <ChatIcon />
        </PanelButton>
      </div>
    </div>
  )
}

function PanelButton({
  label,
  active,
  onClick,
  badge,
  dot,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  badge?: number
  dot?: boolean
  children: ReactNode
}) {
  return (
    <IconButton label={label} active={active} aria-expanded={active} onClick={onClick}>
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-white/15 px-1 text-[11px] font-semibold text-ink">
          {badge}
        </span>
      )}
      {dot && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--room-accent-ring)] ring-2 ring-[#0e0e16]" />}
    </IconButton>
  )
}

function LeaveButton() {
  const room = useRoomContext()
  const call = useCall()
  const isRecording = useIsRecording()
  const [open, setOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function endForAll(): Promise<void> {
    if (ending) return
    setEnding(true)
    call.markEndedByMe()
    const res = await endCallForEveryone(call.slug).catch(() => null)
    if (!res?.ok) {
      call.unmarkEndedByMe()
      setEnding(false)
      call.notify(res?.error ?? 'Could not end the call.', 'error')
    }
  }

  const leaveBtn = (
    <button
      type="button"
      onClick={() => (call.role === 'host' ? setOpen((o) => !o) : void room.disconnect())}
      aria-label={call.role === 'host' ? 'Leave options' : 'Leave call'}
      title={call.role === 'host' ? 'Leave options' : 'Leave call'}
      aria-haspopup={call.role === 'host' ? 'dialog' : undefined}
      aria-expanded={call.role === 'host' ? open : undefined}
      className="flex h-11 items-center gap-2 rounded-full bg-red-500 px-3.5 text-sm font-semibold text-white transition hover:bg-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 min-[50rem]:px-4"
    >
      <LeaveIcon size={18} />
      <span className="hidden min-[50rem]:inline" aria-hidden>
        Leave
      </span>
    </button>
  )

  if (call.role !== 'host') return leaveBtn

  return (
    <div ref={ref} className="relative">
      {leaveBtn}
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} align="end" label="Leave options">
        <MenuItem icon={<LeaveIcon size={16} />} hint="Others can keep talking" onSelect={() => void room.disconnect()}>
          Leave call
        </MenuItem>
        <MenuItem
          tone="danger"
          icon={<LockIcon size={16} />}
          hint={isRecording ? 'Everyone is disconnected and the recording stops' : 'Everyone will be disconnected'}
          onSelect={() => void endForAll()}
        >
          {ending ? 'Ending…' : 'End call for everyone'}
        </MenuItem>
      </Popover>
    </div>
  )
}
