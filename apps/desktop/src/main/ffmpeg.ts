import { spawn } from 'child_process'
import { join } from 'path'
import { readFile, unlink } from 'fs/promises'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'

/**
 * Resolve the bundled ffmpeg binary. In a packaged app the binary is unpacked
 * from the asar (see `asarUnpack` in electron-builder.yml), so the path inside
 * `app.asar` must be rewritten to `app.asar.unpacked`.
 */
export function ffmpegBinaryPath(): string {
  if (!ffmpegStatic) {
    throw new Error('ffmpeg binary not found (ffmpeg-static failed to install)')
  }
  return app.isPackaged ? ffmpegStatic.replace('app.asar', 'app.asar.unpacked') : ffmpegStatic
}

// Matches ffmpeg's `time=HH:MM:SS.xx` progress markers on stderr.
const TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/

function run(
  args: string[],
  onStderr?: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // `signal` lets the caller kill an in-flight ffmpeg (on quit/abort) so it is
    // never orphaned to launchd.
    const proc = spawn(ffmpegBinaryPath(), args, signal ? { signal } : {})
    let stderrTail = ''
    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      stderrTail = (stderrTail + text).slice(-4000)
      onStderr?.(text)
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderrTail.slice(-800)}`))
    })
  })
}

/**
 * Transcode the recorded webm to a streaming-friendly MP4:
 * H.264 (libx264, veryfast, crf 23) + AAC 160k, faststart. `onProgress` is
 * driven by ffmpeg's stderr `time=` against the known recording duration.
 */
export function transcodeToMp4(
  input: string,
  output: string,
  totalDurationSeconds: number,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const args = [
    '-y',
    '-i',
    input,
    // libx264 with yuv420p requires even width AND height. Screen/window captures
    // can be odd-sized (e.g. 1738x1079), which makes the encoder fail to open, so
    // round each dimension down to the nearest even number.
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    output,
  ]
  return run(
    args,
    (text) => {
      const match = TIME_RE.exec(text)
      if (match && totalDurationSeconds > 0) {
        const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        onProgress(Math.min(1, Math.max(0, seconds / totalDurationSeconds)))
      }
    },
    signal,
  ).then(() => onProgress(1))
}

/** Whether a media file has at least one audio stream (parsed from ffmpeg -i). */
function probeHasAudio(input: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBinaryPath(), ['-hide_banner', '-i', input])
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', () => resolve(/Stream #\d+:\d+.*: Audio:/.test(stderr)))
    proc.on('error', () => resolve(false))
  })
}

/**
 * The container's real duration in seconds (float), parsed from `ffmpeg -i`.
 * Returns null if it can't be determined. Used to clamp edit spans to the actual
 * media length rather than the rounded wall-clock estimate.
 */
export function probeDurationSeconds(input: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBinaryPath(), ['-hide_banner', '-i', input])
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', () => {
      const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
      resolve(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null)
    })
    proc.on('error', () => resolve(null))
  })
}

/**
 * Re-encode `input` to `output` keeping only `segments` (in seconds), in order,
 * concatenated. Used for trim (one segment) and mid-cuts (multiple). Audio is
 * carried through only if the source has an audio stream.
 */
export async function applyEdits(
  input: string,
  output: string,
  segments: { start: number; end: number }[],
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const clips = segments.filter((s) => s.end - s.start > 0.05)
  if (clips.length === 0) throw new Error('Nothing to keep')
  const hasAudio = await probeHasAudio(input)

  const filters: string[] = []
  clips.forEach((s, i) => {
    filters.push(`[0:v]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[v${i}]`)
    if (hasAudio) {
      filters.push(`[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`)
    }
  })
  const interleaved = clips.map((_, i) => (hasAudio ? `[v${i}][a${i}]` : `[v${i}]`)).join('')
  const concat = `${interleaved}concat=n=${clips.length}:v=1:a=${hasAudio ? 1 : 0}${
    hasAudio ? '[outv][outa]' : '[outv]'
  }`
  const filterComplex = `${filters.join(';')};${concat}`

  const args = ['-y', '-i', input, '-filter_complex', filterComplex, '-map', '[outv]']
  if (hasAudio) args.push('-map', '[outa]', '-c:a', 'aac', '-b:a', '160k')
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output,
  )

  const totalKept = clips.reduce((sum, s) => sum + (s.end - s.start), 0)
  return run(
    args,
    (text) => {
      const match = TIME_RE.exec(text)
      if (match && totalKept > 0) {
        const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        onProgress(Math.min(1, Math.max(0, seconds / totalKept)))
      }
    },
    signal,
  ).then(() => onProgress(1))
}

/** Grab a frame ~1s in, scaled to 320px wide, and return it as a JPEG data URL. */
export async function makeThumbnailDataUrl(videoPath: string): Promise<string> {
  const tempThumb = join(app.getPath('temp'), `lmsy-thumb-${process.pid}-${Date.now()}.jpg`)
  await run(['-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=320:-1', tempThumb])
  try {
    const buffer = await readFile(tempThumb)
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } finally {
    await unlink(tempThumb).catch(() => undefined)
  }
}
