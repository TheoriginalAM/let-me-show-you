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
