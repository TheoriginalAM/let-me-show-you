import type { AreaRect, StartRecordingPayload, WebcamShape } from '@shared/ipc'

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
  // In 'area' mode the recorded stream is a canvas crop; the raw desktop feed is
  // kept here so it can be stopped, and cropRaf/cropVideo drive the crop draw.
  private sourceStream: MediaStream | null = null
  private cropRaf: number | null = null
  private cropVideo: HTMLVideoElement | null = null
  private webcamCompositeStream: MediaStream | null = null
  private webcamVideoEl: HTMLVideoElement | null = null
  private cropPaused = false
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
      // Video source depends on the mode: camera-only records the webcam;
      // screen/window/area capture the desktop (area then crops via a canvas).
      let videoStream: MediaStream
      try {
        if (payload.mode === 'camera') {
          await window.recorder.requestMediaAccess('camera').catch(() => false)
          videoStream = await navigator.mediaDevices.getUserMedia({
            video: payload.cameraId
              ? { deviceId: { exact: payload.cameraId }, width: 1280, height: 720 }
              : { width: 1280, height: 720 },
            audio: false,
          })
        } else {
          const desktop = await navigator.mediaDevices.getUserMedia({
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
          // window/area can overlay the webcam by compositing it onto a canvas:
          // window capture excludes the floating bubble, and area already draws to
          // a canvas to crop. Screen mode leaves the on-screen bubble as-is.
          const overlayCameraId =
            payload.mode === 'window' || payload.mode === 'area' ? payload.cameraId : null
          if (payload.mode === 'area' || overlayCameraId) {
            let webcam: { stream: MediaStream; shape: WebcamShape } | null = null
            if (overlayCameraId) {
              try {
                const camStream = await navigator.mediaDevices.getUserMedia({
                  video: { deviceId: { exact: overlayCameraId }, width: 640, height: 640 },
                  audio: false,
                })
                const cfg = await window.recorder.getWebcamConfig().catch(() => null)
                webcam = { stream: camStream, shape: cfg?.shape ?? 'circle' }
              } catch {
                webcam = null // overlay is best-effort
              }
            }
            videoStream = this.buildComposite(desktop, {
              crop: payload.mode === 'area' ? payload.areaRect : null,
              webcam,
            })
          } else {
            videoStream = desktop
          }
        }
      } catch (error) {
        this.releaseStream()
        await window.recorder.abortRecording(`Could not start capture: ${message(error)}`)
        return
      }

      // Audio: a separate mic stream (echo cancellation + noise suppression).
      // TODO: system/desktop audio capture is out of scope for now — mic only.
      let audioStream: MediaStream | null = null
      if (payload.micId) {
        // Trigger the macOS mic permission prompt first — getUserMedia alone does
        // not reliably surface it in a packaged app. Denial → we fall back to
        // video-only below.
        await window.recorder.requestMediaAccess('microphone').catch(() => false)
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

      // If the user stops sharing via the OS overlay, finish gracefully. In area
      // mode the recorded track is the canvas, so also watch the raw desktop feed.
      combined.getVideoTracks()[0]?.addEventListener('ended', () => this.stop())
      this.sourceStream?.getVideoTracks()[0]?.addEventListener('ended', () => this.stop())

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
      this.cropPaused = true
      void window.recorder.pauseRecording()
    }
  }

  resume(): void {
    if (this.recorder?.state === 'paused') {
      this.recorder.resume()
      this.cropPaused = false
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

  /**
   * Composite the desktop feed onto a canvas and record THAT: optionally cropped
   * to an area (DIP rect mapped to captured-video pixels, which may be downscaled
   * from native) and/or with the webcam drawn into the bottom-right corner
   * (window capture can't include the separate floating bubble). Raw streams are
   * retained for cleanup.
   */
  private buildComposite(
    desktop: MediaStream,
    opts: { crop: AreaRect | null; webcam: { stream: MediaStream; shape: WebcamShape } | null },
  ): MediaStream {
    this.sourceStream = desktop
    const srcVideo = document.createElement('video')
    srcVideo.srcObject = desktop
    srcVideo.muted = true
    void srcVideo.play().catch(() => undefined)
    this.cropVideo = srcVideo

    let camVideo: HTMLVideoElement | null = null
    if (opts.webcam) {
      this.webcamCompositeStream = opts.webcam.stream
      camVideo = document.createElement('video')
      camVideo.srcObject = opts.webcam.stream
      camVideo.muted = true
      void camVideo.play().catch(() => undefined)
      this.webcamVideoEl = camVideo
    }
    const camShape: WebcamShape = opts.webcam?.shape ?? 'circle'

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    let sx = 0
    let sy = 0
    let sw = 0
    let sh = 0
    let sized = false

    const setup = (): boolean => {
      const vw = srcVideo.videoWidth
      const vh = srcVideo.videoHeight
      if (!vw || !vh) return false
      if (opts.crop) {
        const scaleX = vw / opts.crop.displayWidth
        const scaleY = vh / opts.crop.displayHeight
        sx = Math.round(opts.crop.x * scaleX)
        sy = Math.round(opts.crop.y * scaleY)
        sw = Math.max(2, Math.round(opts.crop.width * scaleX))
        sh = Math.max(2, Math.round(opts.crop.height * scaleY))
      } else {
        sx = 0
        sy = 0
        sw = vw
        sh = vh
      }
      sw -= sw % 2 // even dims keep the downstream H.264 encoder happy
      sh -= sh % 2
      canvas.width = sw
      canvas.height = sh
      sized = true
      return true
    }

    const draw = (): void => {
      if (!sized && !setup()) {
        this.cropRaf = requestAnimationFrame(draw)
        return
      }
      // Skip the decode+draw while paused (no output is being recorded anyway).
      if (!this.cropPaused && ctx) {
        ctx.drawImage(srcVideo, sx, sy, sw, sh, 0, 0, sw, sh)
        if (camVideo && camVideo.videoWidth) {
          const size = Math.round(Math.min(sw, sh) * 0.26)
          const margin = Math.round(size * 0.16)
          const dx = sw - size - margin
          const dy = sh - size - margin
          const cw = camVideo.videoWidth
          const ch = camVideo.videoHeight
          const side = Math.min(cw, ch)
          const cxs = (cw - side) / 2
          const cys = (ch - side) / 2
          const radius =
            camShape === 'circle' ? size / 2 : camShape === 'rounded' ? size * 0.24 : size * 0.08
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(dx, dy, size, size, radius)
          ctx.clip()
          ctx.translate(dx + size, dy)
          ctx.scale(-1, 1) // mirror, selfie-style (matches the bubble)
          ctx.drawImage(camVideo, cxs, cys, side, side, 0, 0, size, size)
          ctx.restore()
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(dx, dy, size, size, radius)
          ctx.lineWidth = Math.max(2, Math.round(size * 0.03))
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.stroke()
          ctx.restore()
        }
      }
      this.cropRaf = requestAnimationFrame(draw)
    }
    this.cropPaused = false
    this.cropRaf = requestAnimationFrame(draw)
    return canvas.captureStream(30)
  }

  private releaseStream(): void {
    if (this.cropRaf !== null) {
      cancelAnimationFrame(this.cropRaf)
      this.cropRaf = null
    }
    if (this.cropVideo) {
      this.cropVideo.srcObject = null
      this.cropVideo = null
    }
    if (this.webcamVideoEl) {
      this.webcamVideoEl.srcObject = null
      this.webcamVideoEl = null
    }
    if (this.webcamCompositeStream) {
      for (const track of this.webcamCompositeStream.getTracks()) track.stop()
      this.webcamCompositeStream = null
    }
    if (this.sourceStream) {
      for (const track of this.sourceStream.getTracks()) track.stop()
      this.sourceStream = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
  }
}

export const capture = new CaptureController()
