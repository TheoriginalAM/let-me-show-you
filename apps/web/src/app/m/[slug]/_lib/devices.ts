'use client'

import { useEffect, useState } from 'react'
import {
  MediaDeviceFailure,
  supportsAudioOutputSelection,
  TrackEvent,
  type LocalVideoTrack,
} from 'livekit-client'

/**
 * Whether this browser lets us choose the speaker. LiveKit allows it on Chrome,
 * Edge and Firefox desktop; never on Safari, iOS or Android. Checked after mount
 * only: the check touches `document`, which would crash (or mismatch) on the server.
 */
export function useSpeakerSelectable(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    try {
      setOk(supportsAudioOutputSelection())
    } catch {
      setOk(false)
    }
  }, [])
  return ok
}

/**
 * Devices of one kind, kept fresh when hardware is plugged in or removed. Never
 * asks for permission itself (labels fill in once the camera/mic is allowed).
 * Pass `enabled: false` to skip listing entirely (e.g. speakers on Safari).
 * Browsers don't fire 'devicechange' when permission is granted, so pass a
 * `refreshKey` that changes once capture starts (e.g. the preview track).
 */
export function useDeviceList(
  kind: MediaDeviceKind,
  enabled = true,
  refreshKey?: unknown,
): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      return
    }
    let active = true
    const refresh = (): void => {
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => {
          if (!active) return
          setDevices(all.filter((d) => d.kind === kind && d.deviceId !== ''))
        })
        .catch(() => undefined)
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      active = false
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [kind, enabled, refreshKey])
  return devices
}

/**
 * The live camera/mic capture behind a LiveKit track. With a processor (blur,
 * Krisp) attached, `mediaStreamTrack` is the processed output, whose id and
 * capabilities aren't the real device's; the source is kept in `mediaStream`.
 */
export function sourceTrack(track: {
  mediaStream?: MediaStream
  mediaStreamTrack: MediaStreamTrack
  kind: string
}): MediaStreamTrack {
  const list =
    track.kind === 'audio' ? track.mediaStream?.getAudioTracks() : track.mediaStream?.getVideoTracks()
  return list?.[0] ?? track.mediaStreamTrack
}

function friendlyLabel(label: string): string {
  // Android names cameras like "camera2 1, facing front".
  if (/facing front/i.test(label)) return 'Front camera'
  if (/facing back/i.test(label)) return 'Back camera'
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
}

/**
 * A readable name for a device (browsers hide labels until permission). Pass
 * the whole list so repeats get numbered: phones with several lenses per side
 * would otherwise show "Back camera" twice.
 */
export function deviceLabel(
  d: MediaDeviceInfo | undefined,
  index: number,
  kind: string,
  all?: MediaDeviceInfo[],
): string {
  if (!d?.label) return `${kind} ${index + 1}`
  const name = friendlyLabel(d.label)
  if (!all) return name
  const same = all.filter((x) => x.label && friendlyLabel(x.label) === name)
  const n = same.findIndex((x) => x.deviceId === d.deviceId)
  return same.length > 1 && n > 0 ? `${name} ${n + 1}` : name
}

/** Which way a camera faces, from its label (for flipping front/back). */
export function cameraSide(d: MediaDeviceInfo): 'front' | 'back' | null {
  if (/facing front|front|user|facetime/i.test(d.label)) return 'front'
  if (/facing back|back|rear|environment/i.test(d.label)) return 'back'
  return null
}

/**
 * Whether a camera track points away from the user (a phone's back camera).
 * Its picture must never be mirrored, or text you show reads backwards.
 */
export function isRearCamera(track: Parameters<typeof sourceTrack>[0] | null | undefined): boolean {
  if (!track) return false
  try {
    return sourceTrack(track).getSettings().facingMode === 'environment'
  } catch {
    return false
  }
}

/** isRearCamera, kept up to date as the camera is switched (the track restarts). */
export function useIsRearCamera(track: LocalVideoTrack | null | undefined): boolean {
  const [rear, setRear] = useState(false)
  useEffect(() => {
    if (!track) {
      setRear(false)
      return
    }
    const update = (): void => setRear(isRearCamera(track))
    update()
    track.on(TrackEvent.Restarted, update)
    return () => {
      track.off(TrackEvent.Restarted, update)
    }
  }, [track])
  return rear
}

export type MediaProblem = 'denied' | 'busy' | 'notfound' | 'other'

/** Why a camera/mic couldn't start, in terms we can explain to people. */
export function classifyMediaError(error: unknown): MediaProblem {
  const failure = MediaDeviceFailure.getFailure(error)
  if (failure === MediaDeviceFailure.PermissionDenied) return 'denied'
  if (failure === MediaDeviceFailure.DeviceInUse) return 'busy'
  if (failure === MediaDeviceFailure.NotFound) return 'notfound'
  return 'other'
}

export type Platform = 'ios' | 'android' | 'desktop'

/** Rough platform, for instructions only (never for feature checks). */
export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

const ALLOW_STEPS: Record<Platform, string> = {
  ios: 'Tap Try again and choose Allow. If Safari doesn\u2019t ask, tap the page menu in the address bar, open Website Settings and allow them.',
  android: 'Tap the icon at the left of the address bar, open Permissions, allow them, then tap Try again.',
  desktop: 'Click the camera icon in the address bar, choose Allow, then try again.',
}

/**
 * What to tell people when the camera and/or microphone couldn't start, naming
 * only the device(s) that actually failed. Null when both are fine.
 */
export function mediaProblemCopy(video: MediaProblem | null, audio: MediaProblem | null): string | null {
  const problem = video ?? audio
  if (!problem) return null
  const what = video && audio ? 'camera and microphone' : video ? 'camera' : 'microphone'
  switch (problem) {
    case 'denied':
      return `Your browser is blocking your ${what}. ${ALLOW_STEPS[platform()]}`
    case 'busy':
      return `Your ${what} ${video && audio ? 'are' : 'is'} being used by another app. Close it, then try again.`
    case 'notfound':
      return video && audio
        ? "We couldn't find a camera or microphone. You can still join and listen."
        : `We couldn't find a ${what}. You can still join without it.`
    default:
      return video && audio
        ? "We couldn't start your camera or microphone. You can still join with them turned off."
        : `We couldn't start your ${what}. You can still join without it.`
  }
}
