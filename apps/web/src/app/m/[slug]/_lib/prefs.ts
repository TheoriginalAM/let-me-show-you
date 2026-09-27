'use client'

import { useSyncExternalStore } from 'react'

/** Camera quality the user sends. */
export type Quality = 'sd' | 'hd' | 'fhd'
/** 'standard' = the browser's own processing, 'enhanced' = LiveKit Krisp, 'off' = raw. */
export type NoiseMode = 'standard' | 'enhanced' | 'off'

/**
 * Microphone capture settings for a noise mode. 'off' sends raw sound (best for
 * music); the others use the browser's processing (Krisp is added on top).
 */
export function audioConstraints(noise: NoiseMode) {
  const raw = noise === 'off'
  return { echoCancellation: true, noiseSuppression: !raw, autoGainControl: !raw }
}

/**
 * Meeting preferences, remembered on this device for every room. The single
 * source of truth for devices and call settings (LiveKit's own
 * `lk-user-choices` store is never used).
 */
export interface MeetPrefs {
  audioInputId: string | null
  videoInputId: string | null
  audioOutputId: string | null
  quality: Quality
  blur: boolean
  mirror: boolean
  hideSelf: boolean
  noise: NoiseMode
  sounds: boolean
}

export const DEFAULT_PREFS: MeetPrefs = {
  audioInputId: null,
  videoInputId: null,
  audioOutputId: null,
  quality: 'hd',
  blur: false,
  mirror: true,
  hideSelf: false,
  noise: 'standard',
  sounds: true,
}

const KEY = 'lmsy-meet-prefs:v1'
const listeners = new Set<() => void>()
let cache: MeetPrefs | null = null

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length < 512 ? v : null
}

function sanitize(raw: unknown): MeetPrefs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    audioInputId: str(v.audioInputId),
    videoInputId: str(v.videoInputId),
    audioOutputId: str(v.audioOutputId),
    quality: v.quality === 'sd' || v.quality === 'fhd' ? v.quality : 'hd',
    blur: v.blur === true,
    mirror: v.mirror !== false,
    hideSelf: v.hideSelf === true,
    noise: v.noise === 'enhanced' || v.noise === 'off' ? v.noise : 'standard',
    sounds: v.sounds !== false,
  }
}

function read(): MeetPrefs {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? sanitize(JSON.parse(raw)) : DEFAULT_PREFS
  } catch {
    cache = DEFAULT_PREFS // storage blocked or corrupt
  }
  return cache
}

/** Read the current preferences outside React (e.g. when creating the Room). */
export function getPrefs(): MeetPrefs {
  return read()
}

export function setPrefs(patch: Partial<MeetPrefs>): void {
  cache = { ...read(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // storage blocked: still applies for this page
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMeetPrefs(): [MeetPrefs, (patch: Partial<MeetPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFS)
  return [prefs, setPrefs]
}
