import { VideoPresets, type VideoPreset } from 'livekit-client'
import type { Quality } from './prefs'

export interface QualityOption {
  id: Quality
  label: string
  detail: string
  preset: VideoPreset
  /**
   * Extra simulcast layers so viewers on weak connections still get a lower
   * version. Only needed for 1080p (the default [180p, 360p] suits 720p).
   * Never set a fixed `videoEncoding`: LiveKit derives bitrate from the size.
   */
  layers?: VideoPreset[]
}

export const QUALITY: Record<Quality, QualityOption> = {
  sd: {
    id: 'sd',
    label: 'Data saver',
    detail: '360p · For weak connections',
    preset: VideoPresets.h360,
  },
  hd: { id: 'hd', label: 'HD', detail: '720p · Recommended', preset: VideoPresets.h720 },
  fhd: {
    id: 'fhd',
    label: 'Full HD',
    detail: '1080p · Sharpest, uses more data',
    preset: VideoPresets.h1080,
    layers: [VideoPresets.h360, VideoPresets.h720],
  },
}

export const QUALITY_ORDER: Quality[] = ['sd', 'hd', 'fhd']

/** Tallest frame a camera track can deliver (null if the browser won't say). */
export function maxCameraHeight(track: MediaStreamTrack | undefined): number | null {
  try {
    const caps = track?.getCapabilities?.() as MediaTrackCapabilities | undefined
    const max = caps?.height?.max
    return typeof max === 'number' ? max : null
  } catch {
    return null
  }
}
