'use client'

import { useEffect, useRef, useState } from 'react'
import type { LocalVideoTrack, TrackProcessor, Track } from 'livekit-client'
import { sourceTrack } from './devices'
import { getPrefs } from './prefs'

const BLUR_RADIUS = 14

type Processors = typeof import('@livekit/track-processors')
let loaded: Promise<Processors> | null = null

// The processor library (and its MediaPipe model) only loads if someone
// actually turns blur on, or when we check support.
function load(): Promise<Processors> {
  loaded ??= import('@livekit/track-processors')
  return loaded
}

function makeBlur(m: Processors): TrackProcessor<Track.Kind.Video> {
  return m.BackgroundProcessor({ mode: 'background-blur', blurRadius: BLUR_RADIUS })
}

/** Whether background blur can run in this browser (checked lazily, after mount). */
export function useBlurSupported(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    let active = true
    load()
      .then((m) => active && setOk(m.supportsBackgroundProcessors()))
      .catch(() => active && setOk(false))
    return () => {
      active = false
    }
  }, [])
  return ok
}

/** Whether blur is switched on *and* can run here. */
export async function blurWanted(): Promise<boolean> {
  if (!getPrefs().blur) return false
  try {
    return (await load()).supportsBackgroundProcessors()
  } catch {
    return false
  }
}

/**
 * Capture options that put blur on a camera track *before* it's published (so
 * nobody, and no recording, ever sees an unblurred frame). A fresh processor per
 * track: stopping a track destroys its processor. Empty when blur is off or
 * unsupported.
 */
export async function blurCaptureOption(): Promise<{ processor?: TrackProcessor<Track.Kind.Video> }> {
  if (!getPrefs().blur) return {}
  try {
    const m = await load()
    return m.supportsBackgroundProcessors() ? { processor: makeBlur(m) } : {}
  } catch {
    return {}
  }
}

/**
 * Keep blur on an existing track in sync with `enabled` (the pre-join preview,
 * and toggling blur mid-call). Operations are serialized and re-check the
 * latest wish when they finish, so fast toggles can't leave it inverted.
 *
 * A camera that's switched off has a stopped capture, which blur can't attach
 * to; that's left alone here (turning the camera back on replaces it with a
 * blurred one, see setCameraOn). If blur fails to start, `onFail` is called.
 */
export function useTrackBlur(
  track: LocalVideoTrack | null | undefined,
  enabled: boolean,
  onFail?: () => void,
): void {
  const want = useRef(enabled)
  want.current = enabled
  const fail = useRef(onFail)
  fail.current = onFail
  const chain = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!track) return
    let alive = true
    const sync = async (): Promise<void> => {
      // Loop until the track matches the latest wish (it may change mid-await).
      for (let i = 0; i < 3 && alive; i++) {
        const has = !!track.getProcessor()
        if (has === want.current) return
        if (want.current) {
          if (track.isMuted || sourceTrack(track).readyState === 'ended') return
          const m = await load()
          if (!alive || !m.supportsBackgroundProcessors()) return
          if (!track.getProcessor()) await track.setProcessor(makeBlur(m))
        } else {
          await track.stopProcessor()
        }
      }
    }
    chain.current = chain.current.then(sync).catch((error) => {
      console.error('[meeting] background blur failed:', error)
      if (alive && want.current) fail.current?.()
    })
    return () => {
      alive = false
    }
  }, [track, enabled])
}
