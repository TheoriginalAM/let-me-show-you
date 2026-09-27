'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { useKrispNoiseFilter } from '@livekit/components-react/krisp'
import {
  MediaDeviceFailure,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type Room,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from 'livekit-client'
import { blurCaptureOption, blurWanted, useTrackBlur } from './blur'
import { sourceTrack } from './devices'
import { getPrefs, setPrefs, useMeetPrefs, type NoiseMode, type Quality } from './prefs'
import { QUALITY } from './quality'

/** A camera/mic problem (missing, blocked or busy), as opposed to anything else. */
export function isDeviceError(error: unknown): boolean {
  const failure = MediaDeviceFailure.getFailure(error)
  return (
    failure === MediaDeviceFailure.NotFound ||
    failure === MediaDeviceFailure.PermissionDenied ||
    failure === MediaDeviceFailure.DeviceInUse ||
    (error as Error | undefined)?.name === 'OverconstrainedError'
  )
}

/** The device currently in use for a kind, kept in sync with LiveKit. */
export function useActiveDevice(kind: MediaDeviceKind): string | undefined {
  const room = useRoomContext()
  const [id, setId] = useState(() => room.getActiveDevice(kind))
  useEffect(() => {
    setId(room.getActiveDevice(kind))
    const onChange = (k: MediaDeviceKind, deviceId: string): void => {
      if (k === kind) setId(deviceId)
    }
    room.on(RoomEvent.ActiveDeviceChanged, onChange)
    return () => {
      room.off(RoomEvent.ActiveDeviceChanged, onChange)
    }
  }, [room, kind])
  return id
}

const PREF_KEY: Record<MediaDeviceKind, 'audioInputId' | 'videoInputId' | 'audioOutputId'> = {
  audioinput: 'audioInputId',
  videoinput: 'videoInputId',
  audiooutput: 'audioOutputId',
}

/**
 * Switch a device during the call and remember the choice. If the new device
 * can't be opened (e.g. another app holds it), LiveKit has already stopped the
 * old capture, so switch back to the previous device rather than leaving the
 * mic or camera silently dead.
 */
export async function switchDevice(room: Room, kind: MediaDeviceKind, deviceId: string): Promise<boolean> {
  const previous = room.getActiveDevice(kind)
  try {
    await room.switchActiveDevice(kind, deviceId)
    setPrefs({ [PREF_KEY[kind]]: deviceId })
    return true
  } catch (error) {
    console.error('[meeting] device switch failed:', error)
    if (kind !== 'audiooutput' && previous && previous !== deviceId && previous !== 'default') {
      await room.switchActiveDevice(kind, previous, false).catch(() => undefined)
    }
    return false
  }
}

/**
 * Turn the camera on with the current effects applied *before* publishing.
 * Returns 'blur-failed' if blur couldn't start (the camera stays off rather
 * than silently publishing the real background); device errors are thrown.
 *
 * With blur, the track is created, given its processor and only then published,
 * all by hand: LiveKit's own processor-at-capture path leaves the camera
 * capturing (light on) if the processor fails to start.
 */
export async function enableCamera(
  room: Room,
  capture: VideoCaptureOptions = {},
  publish?: TrackPublishOptions,
): Promise<'ok' | 'blur-failed'> {
  const lp = room.localParticipant
  const { processor } = await blurCaptureOption()
  if (!processor) {
    await lp.setCameraEnabled(true, capture, publish)
    return 'ok'
  }
  const [track] = (await lp.createTracks({ video: capture })) as LocalVideoTrack[]
  try {
    await track.setProcessor(processor)
  } catch (error) {
    console.error('[meeting] background blur failed to start:', error)
    track.stop()
    return 'blur-failed'
  }
  try {
    await lp.publishTrack(track, { ...publish, source: Track.Source.Camera })
  } catch (error) {
    track.stop()
    throw error
  }
  return 'ok'
}

export const BLUR_FAILED_COPY = "Background blur couldn't start, so your camera stayed off."

/**
 * The camera button / ⌘E. A camera that was never published goes through
 * enableCamera so blur is on before the first frame is sent. A muted camera
 * keeps a processor attached before the mute, but blur switched on *while* it
 * was off can't attach (the capture is stopped), so that camera is replaced
 * with a fresh one that has blur from the start.
 */
export async function setCameraOn(room: Room, on: boolean): Promise<'ok' | 'blur-failed'> {
  const lp = room.localParticipant
  const track = lp.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined
  if (on && !track) return enableCamera(room)
  if (on && track && !track.getProcessor() && (await blurWanted())) {
    const deviceId = room.getActiveDevice('videoinput')
    await lp.unpublishTrack(track)
    return enableCamera(room, deviceId && deviceId !== 'default' ? { deviceId } : {})
  }
  await lp.setCameraEnabled(on)
  return 'ok'
}

/**
 * Change camera quality mid-call. LiveKit only re-derives the video layers when
 * the camera is published, so unpublish and publish again (a muted camera just
 * takes the new setting next time it's turned on).
 */
export async function changeCameraQuality(room: Room, q: Quality): Promise<'ok' | 'blur-failed'> {
  const opt = QUALITY[q]
  setPrefs({ quality: q })
  room.options.videoCaptureDefaults = {
    ...room.options.videoCaptureDefaults,
    resolution: opt.preset.resolution,
  }
  room.options.publishDefaults = { ...room.options.publishDefaults, videoSimulcastLayers: opt.layers }

  const lp = room.localParticipant
  const pub = lp.getTrackPublication(Track.Source.Camera)
  const track = pub?.track as LocalVideoTrack | undefined
  if (!pub || !track) return 'ok'
  // The real camera, not the blur processor's output (whose id is random).
  const deviceId = sourceTrack(track).getSettings().deviceId ?? room.getActiveDevice('videoinput')
  const wasOn = !pub.isMuted
  await lp.unpublishTrack(track)
  if (!wasOn) return 'ok'
  return enableCamera(
    room,
    { ...(deviceId ? { deviceId } : {}), resolution: opt.preset.resolution },
    { videoSimulcastLayers: opt.layers },
  )
}

/**
 * Keeps the published camera's background blur in sync with the preference.
 * If blur can't start, the preference is switched back off (so the toggle shows
 * what people actually see) and `onFail` is told.
 */
export function useCallBlur(onFail: () => void): void {
  const [prefs] = useMeetPrefs()
  const { cameraTrack } = useLocalParticipant()
  useTrackBlur(cameraTrack?.track as LocalVideoTrack | undefined, prefs.blur, () => {
    setPrefs({ blur: false })
    onFail()
  })
}

/** Whether LiveKit's enhanced (Krisp) noise cancellation works here. */
export function useKrispSupported(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    let active = true
    import('@livekit/krisp-noise-filter')
      .then((m) => active && setOk(m.isKrispNoiseFilterSupported()))
      .catch(() => active && setOk(false))
    return () => {
      active = false
    }
  }, [])
  return ok
}

function audioConstraints(noise: NoiseMode) {
  const raw = noise === 'off'
  return { echoCancellation: true, noiseSuppression: !raw, autoGainControl: !raw }
}

/**
 * Applies the noise preference to the live microphone: 'standard' uses the
 * browser's processing, 'enhanced' adds Krisp (LiveKit Cloud), 'off' sends raw
 * sound (best for music). Chrome ignores applyConstraints for these, so a
 * change restarts the capture in place (same publication, same mute state;
 * Krisp is restarted with it). Never republishes the mic, which breaks Krisp.
 */
export function useCallNoise(): void {
  const room = useRoomContext()
  const [prefs] = useMeetPrefs()
  const { microphoneTrack } = useLocalParticipant()
  const { setNoiseFilterEnabled } = useKrispNoiseFilter()
  const krispOk = useKrispSupported()
  const track = microphoneTrack?.track as LocalAudioTrack | undefined
  // The processing the current capture was opened with (seeded from join time).
  const captured = useRef<'raw' | 'processed'>(getPrefs().noise === 'off' ? 'raw' : 'processed')

  useEffect(() => {
    const wanted = prefs.noise === 'off' ? 'raw' : 'processed'
    // Future mic captures (e.g. enabling the mic later) use the new setting.
    room.options.audioCaptureDefaults = {
      ...room.options.audioCaptureDefaults,
      ...audioConstraints(prefs.noise),
    }
    if (!track || captured.current === wanted) return
    captured.current = wanted
    const deviceId = sourceTrack(track).getSettings().deviceId ?? room.getActiveDevice('audioinput')
    track
      .restartTrack({ ...(deviceId ? { deviceId } : {}), ...audioConstraints(prefs.noise) })
      .catch((error) => console.error('[meeting] could not apply noise setting:', error))
  }, [room, track, prefs.noise])

  useEffect(() => {
    if (!track || !krispOk) return
    setNoiseFilterEnabled(prefs.noise === 'enhanced').catch((error) =>
      console.error('[meeting] noise filter failed:', error),
    )
  }, [track, prefs.noise, krispOk, setNoiseFilterEnabled])
}
