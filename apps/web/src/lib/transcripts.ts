import 'server-only'

import {
  claimTranscript,
  getTranscriptTarget,
  getTranscriptTargetByAsset,
  saveTranscript,
  setTranscriptState,
} from '@/db/video-notes'
import { getMux } from './mux'
import type { TranscriptCue } from './video-notes'

// Captions and transcripts come from Mux's auto-generated subtitles: Mux
// transcribes the audio track, then the player shows them as captions and we
// keep a copy of the text for the transcript, summary and write-ups.

const TRACK_NAME = 'English (auto)'

/**
 * Asks Mux to transcribe a ready video. Safe to call more than once: it reuses
 * a track that already exists, and a silent video is marked 'none'. `recheck`
 * looks again at a transcript that's been 'pending' (in case a webhook was lost).
 */
export async function requestTranscript(
  videoId: string,
  opts: { recheck?: boolean } = {},
): Promise<void> {
  const v = await getTranscriptTarget(videoId)
  if (!v?.muxAssetId || !v.muxPlaybackId || v.status !== 'ready') return
  if (v.transcriptStatus === 'ready' || v.transcriptStatus === 'none') return
  if (!(opts.recheck && v.transcriptStatus === 'pending') && !(await claimTranscript(v.id))) return
  try {
    await startTranscript(v.id, v.muxAssetId, v.muxPlaybackId)
  } catch (err) {
    await setTranscriptState(v.id, { status: 'failed' })
    throw err
  }
}

async function startTranscript(videoId: string, assetId: string, playbackId: string) {
  const mux = getMux()
  const asset = await mux.video.assets.retrieve(assetId)
  const tracks = asset.tracks ?? []

  const existing = tracks.find(
    (t) => t.type === 'text' && t.text_source === 'generated_vod' && t.status !== 'errored',
  )
  if (existing?.id) {
    if (existing.status === 'ready') {
      await storeTrack(videoId, playbackId, existing.id)
    } else {
      await setTranscriptState(videoId, { status: 'pending', trackId: existing.id })
    }
    return
  }

  const audio = tracks.find((t) => t.type === 'audio')
  if (!audio?.id) {
    await setTranscriptState(videoId, { status: 'none' })
    return
  }

  const created = await mux.video.assets.generateSubtitles(assetId, audio.id, {
    generated_subtitles: [{ language_code: 'en', name: TRACK_NAME, passthrough: videoId }],
  })
  await setTranscriptState(videoId, { status: 'pending', trackId: created[0]?.id ?? null })
}

/** Mux finished a generated caption track: keep the text. Returns the video id. */
export async function handleCaptionTrackReady(
  assetId: string,
  trackId: string,
): Promise<string | null> {
  const v = await getTranscriptTargetByAsset(assetId)
  if (!v?.muxPlaybackId) return null
  await storeTrack(v.id, v.muxPlaybackId, trackId)
  return v.id
}

export async function handleCaptionTrackErrored(assetId: string): Promise<void> {
  const v = await getTranscriptTargetByAsset(assetId)
  if (v) await setTranscriptState(v.id, { status: 'failed' })
}

async function storeTrack(videoId: string, playbackId: string, trackId: string): Promise<void> {
  const res = await fetch(`https://stream.mux.com/${playbackId}/text/${trackId}.vtt`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Couldn't download captions (${res.status})`)
  await saveTranscript(videoId, trackId, parseVtt(await res.text()))
}

/** WebVTT → cues: timings in seconds, markup stripped, empty cues dropped. */
export function parseVtt(vtt: string): TranscriptCue[] {
  const cues: TranscriptCue[] = []
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const timing = lines.findIndex((l) => l.includes('-->'))
    if (timing === -1) continue
    const [from, to] = lines[timing]!.split('-->').map((s) => s.trim().split(/\s+/)[0]!)
    const start = vttSeconds(from!)
    const end = vttSeconds(to!)
    const text = lines
      .slice(timing + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text && start !== null && end !== null) cues.push({ start, end, text })
  }
  return cues
}

function vttSeconds(stamp: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(stamp)
  if (!m) return null
  return (
    Number(m[1] ?? 0) * 3600 +
    Number(m[2]) * 60 +
    Number(m[3]) +
    Number((m[4] ?? '0').padEnd(3, '0')) / 1000
  )
}
