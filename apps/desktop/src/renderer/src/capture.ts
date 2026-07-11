import type { StartRecordingPayload } from '@shared/ipc'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const VIDEO_BITS_PER_SECOND = 8_000_000

/**
 * Owns the browser-side capture: builds the combined MediaStream (desktop video
 * + mic audio), records it with MediaRecorder, and streams each 1s chunk to the
 * main process over IPC. Chunks are never accumulated in renderer memory.
 *
 * This is a module singleton so the control panel and the tray-driven stop can
 * both reach the live recorder.
 */
class CaptureController {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private writeChain: Promise<unknown> = Promise.resolve()
  private starting = false
  private stopping = false
  // Guards against finalize() and fail() both firing a terminal IPC.
  private settled = false

  /** True while a recorder is (about to be) live in this renderer. */
  get isLive(): boolean {
    return this.recorder !== null || this.starting
  }

  async start(payload: StartRecordingPayload): Promise<void> {
    // Synchronous guard closes the getUserMedia await window so a double-click
    // can't spin up (and orphan) a second live capture.
    if (this.recorder || this.starting) return
    this.starting = true
    this.stopping = false
    this.settled = false

    try {
      // Video: desktop capture via the legacy mandatory-constraints pattern.
      let videoStream: MediaStream
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: payload.sourceId,
              maxWidth: 1920,
              maxHeight: 1080,
              maxFrameRate: 30,
            },
          },
        } as unknown as MediaStreamConstraints)
      } catch (error) {
        await window.recorder.abortRecording(`Could not capture the screen: ${message(error)}`)
        return
      }

      // Audio: a separate mic stream (echo cancellation + noise suppression).
      // TODO: system/desktop audio capture is out of scope for now — mic only.
      let audioStream: MediaStream | null = null
      if (payload.micId) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: payload.micId },
              echoCancellation: true,
              noiseSuppression: true,
            },
          })
        } catch {
          audioStream = null // mic unavailable → continue video-only
        }
      }

      const combined = new MediaStream()
      for (const track of videoStream.getVideoTracks()) combined.addTrack(track)
      if (audioStream) for (const track of audioStream.getAudioTracks()) combined.addTrack(track)
      this.stream = combined

      // If the user stops sharing via the OS overlay, finish gracefully.
      combined.getVideoTracks()[0]?.addEventListener('ended', () => this.stop())

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm;codecs=vp8,opus'

      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(combined, {
          mimeType,
          videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        })
      } catch (error) {
        this.releaseStream()
        await window.recorder.abortRecording(`Recorder could not start: ${message(error)}`)
        return
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.enqueue(event.data)
      }
      recorder.onerror = () => void this.fail('The recorder encountered an error.')
      recorder.onstop = () => void this.finalize()
      this.recorder = recorder

      // Open the temp file in main before producing any chunk.
      try {
        await window.recorder.startRecording(payload)
      } catch (error) {
        this.detach(recorder)
        this.recorder = null
        this.releaseStream()
        await window.recorder.abortRecording(`Could not start recording: ${message(error)}`)
        return
      }

      try {
        recorder.start(1000)
      } catch (error) {
        this.detach(recorder)
        this.recorder = null
        this.releaseStream()
        await window.recorder.abortRecording(`Recorder could not start: ${message(error)}`)
      }
    } finally {
      this.starting = false
    }
  }

  pause(): void {
    if (this.recorder?.state === 'recording') {
      this.recorder.pause()
      void window.recorder.pauseRecording()
    }
  }

  resume(): void {
    if (this.recorder?.state === 'paused') {
      this.recorder.resume()
      void window.recorder.resumeRecording()
    }
  }

  stop(): void {
    const recorder = this.recorder
    if (!recorder || this.stopping) return
    this.stopping = true
    // recorder.stop() flips state to 'inactive' synchronously but queues the
    // final dataavailable + stop events; only onstop drives finalize so the
    // tail chunk is never dropped.
    if (recorder.state === 'inactive') void this.finalize()
    else recorder.stop()
  }

  /**
   * Release capture because MAIN ended the session (e.g. a disk write error) —
   * stop the recorder + tracks WITHOUT sending another abort back to main.
   * Idempotent: a no-op once the recorder is already gone.
   */
  forceRelease(): void {
    const recorder = this.recorder
    this.recorder = null
    this.starting = false
    this.settled = true
    if (recorder) {
      this.detach(recorder)
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // already stopping
        }
      }
    }
    this.releaseStream()
  }

  private detach(recorder: MediaRecorder): void {
    recorder.ondataavailable = null
    recorder.onerror = null
    recorder.onstop = null
  }

  private enqueue(blob: Blob): void {
    // Serialize writes to preserve chunk order; the blob is discarded after send.
    // The catch is fire-and-forget so the chain always settles (else fail()'s
    // `await this.writeChain` would deadlock on a promise that adopts fail()).
    this.writeChain = this.writeChain
      .then(() => blob.arrayBuffer())
      .then((buffer) => window.recorder.writeChunk(new Uint8Array(buffer)))
      .catch((error) => {
        void this.fail(`Failed to save recording: ${message(error)}`)
      })
  }

  private async finalize(): Promise<void> {
    if (this.settled) return
    this.settled = true
    this.recorder = null
    this.releaseStream()
    await this.writeChain.catch(() => undefined) // flush pending chunk writes
    await window.recorder.finishRecording()
  }

  private async fail(reason: string): Promise<void> {
    if (this.settled) return
    this.settled = true
    const recorder = this.recorder
    this.recorder = null
    if (recorder) {
      this.detach(recorder)
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // already stopping
        }
      }
    }
    this.releaseStream()
    await this.writeChain.catch(() => undefined)
    await window.recorder.abortRecording(reason)
  }

  private releaseStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
  }
}

export const capture = new CaptureController()
