import { createWriteStream, type WriteStream } from 'fs'
import { mkdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type {
  EditSegment,
  RecordingError,
  RecordingResult,
  RecordingState,
  RecordingStatus,
} from '../shared/ipc'
import {
  applyEdits,
  makeThumbnailDataUrl,
  probeDurationSeconds,
  transcodeToMp4,
} from './ffmpeg'

type StatusListener = (status: RecordingStatus) => void

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function fileHasData(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).size > 0
  } catch {
    return false
  }
}

/**
 * Owns the recording lifecycle in the main process: it writes the streamed
 * MediaRecorder chunks to a temp .webm, then transcodes to MP4 with ffmpeg.
 * The tray and renderer both observe it via `onChange`.
 */
export class RecordingSession {
  private state: RecordingState = 'idle'
  private startedAt: number | null = null
  private accumulatedMs = 0
  private progress = 0
  private result: RecordingResult | null = null
  private error: RecordingError | null = null

  private writeStream: WriteStream | null = null
  private tempWebmPath = ''
  private wallClockStart = 0
  private transcodeAbort: AbortController | null = null
  private editAbort: AbortController | null = null
  /** The last edit we generated, so re-editing replaces it rather than piling up. */
  private lastEditedPath: string | null = null

  private readonly listeners = new Set<StatusListener>()

  getStatus(): RecordingStatus {
    return {
      state: this.state,
      startedAt: this.startedAt,
      accumulatedMs: this.accumulatedMs,
      progress: this.progress,
      result: this.result,
      error: this.error,
    }
  }

  onChange(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** recording or paused — i.e. a MediaRecorder is live in the renderer. */
  isActive(): boolean {
    return this.state === 'recording' || this.state === 'paused'
  }

  private emit(): void {
    const status = this.getStatus()
    for (const listener of this.listeners) listener(status)
  }

  private elapsedMs(): number {
    return (
      this.accumulatedMs +
      (this.state === 'recording' && this.startedAt ? Date.now() - this.startedAt : 0)
    )
  }

  /** Open the temp file and move to `recording`. Called once streams are ready. */
  begin(): void {
    if (this.state !== 'idle') {
      throw new Error('A recording is already in progress')
    }
    this.wallClockStart = Date.now()
    this.tempWebmPath = join(app.getPath('temp'), `lmsy-recording-${this.wallClockStart}.webm`)
    const stream = createWriteStream(this.tempWebmPath)
    stream.on('error', (err) => {
      // Disk full / IO failure while writing chunks.
      void this.abort(`Failed to write recording: ${errorMessage(err)}`)
    })
    this.writeStream = stream
    this.state = 'recording'
    this.startedAt = Date.now()
    this.accumulatedMs = 0
    this.progress = 0
    this.result = null
    this.error = null
    this.emit()
  }

  writeChunk(chunk: Uint8Array): Promise<void> {
    if (!this.writeStream || !this.isActive()) return Promise.resolve()
    const stream = this.writeStream
    if (stream.write(Buffer.from(chunk))) return Promise.resolve()
    // Buffer is full — apply backpressure so the awaited IPC throttles the
    // renderer to disk throughput instead of buffering unbounded in memory.
    return new Promise((resolve) => {
      const done = (): void => {
        stream.off('drain', done)
        stream.off('close', done)
        resolve()
      }
      stream.once('drain', done)
      stream.once('close', done)
    })
  }

  pause(): void {
    if (this.state !== 'recording') return
    this.accumulatedMs += Date.now() - (this.startedAt ?? Date.now())
    this.startedAt = null
    this.state = 'paused'
    this.emit()
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.startedAt = Date.now()
    this.state = 'recording'
    this.emit()
  }

  private closeStream(): Promise<void> {
    const stream = this.writeStream
    this.writeStream = null
    if (!stream) return Promise.resolve()
    return new Promise((resolve) => stream.end(() => resolve()))
  }

  /** Close the temp file and transcode webm → MP4 (with progress), then clean up. */
  async finish(): Promise<void> {
    if (!this.isActive()) return
    const durationSeconds = Math.max(1, Math.round(this.elapsedMs() / 1000))
    await this.closeStream()

    this.state = 'processing'
    this.startedAt = null
    this.progress = 0
    this.emit()

    const webmPath = this.tempWebmPath
    this.transcodeAbort = new AbortController()
    try {
      const { filePath, fileName } = await this.buildOutputTarget()
      await transcodeToMp4(
        webmPath,
        filePath,
        durationSeconds,
        (fraction) => {
          this.progress = fraction
          this.emit()
        },
        this.transcodeAbort.signal,
      )

      let thumbnailDataUrl: string | null = null
      try {
        thumbnailDataUrl = await makeThumbnailDataUrl(filePath)
      } catch {
        thumbnailDataUrl = null // thumbnail is best-effort
      }

      // Success → delete the temp webm.
      await unlink(webmPath).catch(() => undefined)

      if (this.state !== 'processing') return // superseded (e.g. disposed)
      this.result = { filePath, fileName, thumbnailDataUrl, durationSeconds }
      this.progress = 1
      this.state = 'ready'
      this.emit()
    } catch (err) {
      if (this.state !== 'processing') return
      // Preserve the webm for recovery on failure (disk full, ffmpeg crash).
      const recoverable = await fileHasData(webmPath)
      this.error = {
        message: errorMessage(err),
        recoveredWebmPath: recoverable ? webmPath : null,
      }
      this.state = 'error'
      this.emit()
    } finally {
      this.transcodeAbort = null
    }
  }

  /** Capture/write failure. Preserves the webm if it has any data. */
  async abort(message: string): Promise<void> {
    // Only meaningful while capturing — never race a running transcode or clobber
    // a terminal state.
    if (this.state !== 'recording' && this.state !== 'paused') return
    await this.closeStream()
    const recoverable = this.tempWebmPath ? await fileHasData(this.tempWebmPath) : false
    if (this.tempWebmPath && !recoverable) {
      await unlink(this.tempWebmPath).catch(() => undefined)
    }
    this.error = { message, recoveredWebmPath: recoverable ? this.tempWebmPath : null }
    this.state = 'error'
    this.startedAt = null
    this.emit()
  }

  /** Kill any in-flight ffmpeg work — transcode or edit — (called on app quit). */
  dispose(): void {
    this.transcodeAbort?.abort()
    this.editAbort?.abort()
  }

  /** Dismiss the ready/error screen and return to idle. */
  dismiss(): void {
    if (this.state !== 'ready' && this.state !== 'error') return
    this.state = 'idle'
    this.startedAt = null
    this.accumulatedMs = 0
    this.progress = 0
    this.result = null
    this.error = null
    this.tempWebmPath = ''
    this.lastEditedPath = null
    this.emit()
  }

  /**
   * Trim/cut the ready recording, keeping only `keep` (ordered spans in seconds),
   * and swap the edited MP4 in as the new result. The original file is always
   * preserved; a previous edit (if any) is replaced. Returns the new result.
   */
  async applyEdits(keep: EditSegment[]): Promise<RecordingResult> {
    if (this.state !== 'ready' || !this.result) {
      throw new Error('No finished recording to edit')
    }
    const source = this.result.filePath
    // Clamp spans against the file's ACTUAL duration, not the rounded wall-clock
    // estimate shown in the UI — otherwise a "trim the start, keep the rest" edit
    // would lose the final fraction of a second (or more). Fall back to the
    // estimate only if the probe fails.
    const mediaDuration = (await probeDurationSeconds(source)) ?? this.result.durationSeconds
    const segments = keep
      .filter(
        (s) =>
          s &&
          Number.isFinite(s.start) &&
          Number.isFinite(s.end) &&
          s.end - s.start > 0.05,
      )
      .map((s) => ({
        start: Math.max(0, Math.min(s.start, mediaDuration)),
        end: Math.max(0, Math.min(s.end, mediaDuration)),
      }))
      .filter((s) => s.end - s.start > 0.05)
      .slice(0, 100)
    if (segments.length === 0) throw new Error('Nothing to keep')

    const { filePath, fileName } = await this.buildEditedTarget()
    this.editAbort = new AbortController()
    try {
      await applyEdits(source, filePath, segments, () => undefined, this.editAbort.signal)
    } finally {
      this.editAbort = null
    }

    let thumbnailDataUrl: string | null = null
    try {
      thumbnailDataUrl = await makeThumbnailDataUrl(filePath)
    } catch {
      thumbnailDataUrl = null
    }
    const durationSeconds = Math.max(
      1,
      Math.round(segments.reduce((sum, s) => sum + (s.end - s.start), 0)),
    )

    // Drop the previous edit so repeated edits don't pile up on disk. ffmpeg has
    // finished reading `source` by now, so deleting it here is safe even when the
    // previous edit WAS the source of this one. The original is never touched
    // (it's only recorded in lastEditedPath after the first edit).
    if (this.lastEditedPath && this.lastEditedPath !== filePath) {
      await unlink(this.lastEditedPath).catch(() => undefined)
    }
    this.lastEditedPath = filePath

    const result: RecordingResult = { filePath, fileName, thumbnailDataUrl, durationSeconds }
    if (this.state !== 'ready') return result // superseded (e.g. dismissed)
    this.result = result
    this.emit()
    return result
  }

  /** A distinct "(edited)" filename in the recordings dir, deduped with a suffix. */
  private async buildEditedTarget(): Promise<{ filePath: string; fileName: string }> {
    const dir = join(app.getPath('videos'), 'LetMeShowYou')
    await mkdir(dir, { recursive: true })
    const base = (this.result?.fileName ?? 'Recording.mp4')
      .replace(/\.mp4$/i, '')
      .replace(/ \(edited\)( \(\d+\))?$/i, '')
    let fileName = `${base} (edited).mp4`
    let filePath = join(dir, fileName)
    for (let n = 2; await pathExists(filePath); n++) {
      fileName = `${base} (edited) (${n}).mp4`
      filePath = join(dir, fileName)
    }
    return { filePath, fileName }
  }

  private async buildOutputTarget(): Promise<{ filePath: string; fileName: string }> {
    const dir = join(app.getPath('videos'), 'LetMeShowYou')
    await mkdir(dir, { recursive: true })
    const d = new Date(this.wallClockStart)
    const base = `Recording ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} at ${two(
      d.getHours(),
    )}.${two(d.getMinutes())}`
    let fileName = `${base}.mp4`
    let filePath = join(dir, fileName)
    for (let n = 2; await pathExists(filePath); n++) {
      fileName = `${base} (${n}).mp4`
      filePath = join(dir, fileName)
    }
    return { filePath, fileName }
  }
}
