'use client'

import { useEffect, useState } from 'react'
import { MediaDeviceFailure, supportsAudioOutputSelection } from 'livekit-client'

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

/** A readable name for a device (browsers hide labels until permission). */
export function deviceLabel(d: MediaDeviceInfo | undefined, index: number, kind: string): string {
  if (!d) return `${kind} ${index + 1}`
  if (d.label) return d.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
  return `${kind} ${index + 1}`
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

export const MEDIA_PROBLEM_COPY: Record<MediaProblem, string> = {
  denied:
    'Your browser is blocking your camera and microphone. Click the camera icon in the address bar, choose Allow, then try again.',
  busy: 'Your camera or microphone is being used by another app. Close it, then try again.',
  notfound: "We couldn't find a camera or microphone. You can still join and listen.",
  other: "We couldn't start your camera or microphone. You can still join with them turned off.",
}
