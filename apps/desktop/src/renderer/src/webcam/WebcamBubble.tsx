import { useEffect, useRef, useState } from 'react'
import type { WebcamShape, WebcamSize } from '@shared/ipc'

const SHAPES: WebcamShape[] = ['circle', 'rounded', 'square']
const SIZES: { key: WebcamSize; label: string }[] = [
  { key: 'small', label: 'S' },
  { key: 'medium', label: 'M' },
  { key: 'large', label: 'L' },
]

export function WebcamBubble() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shape, setShape] = useState<WebcamShape>('circle')
  const [size, setSize] = useState<WebcamSize>('medium')

  // Resolve the current camera id without a race, then track changes.
  useEffect(() => {
    let active = true
    void window.recorder.getWebcamCamera().then((id) => {
      if (active) setCameraId(id)
    })
    const unsubscribe = window.recorder.onWebcamCamera(setCameraId)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  // Load the persisted bubble appearance.
  useEffect(() => {
    let active = true
    void window.recorder.getWebcamConfig().then((c) => {
      if (active) {
        setShape(c.shape)
        setSize(c.size)
      }
    })
    return () => {
      active = false
    }
  }, [])

  // (Re)acquire the live camera feed whenever the selected camera changes.
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    async function acquire(): Promise<void> {
      setError(null)
      if (!cameraId) return
      // Surface the macOS camera permission prompt before getUserMedia, which
      // does not reliably trigger it in a packaged app.
      await window.recorder.requestMediaAccess('camera').catch(() => false)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: cameraId }, width: 640, height: 640 },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
      } catch {
        if (!cancelled) setError('Camera unavailable')
      }
    }

    void acquire()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [cameraId])

  function changeShape(next: WebcamShape): void {
    setShape(next)
    void window.recorder.setWebcamShape(next).catch(console.error)
  }

  function changeSize(next: WebcamSize): void {
    setSize(next)
    // Main resizes the window; the bubble fills it via CSS.
    void window.recorder.setWebcamSize(next).catch(console.error)
  }

  return (
    <div className="bubble" data-shape={shape}>
      {cameraId ? (
        <video ref={videoRef} className="bubble-video" autoPlay playsInline muted />
      ) : null}
      {error ? <div className="bubble-error">{error}</div> : null}

      {cameraId ? (
        <div className="bubble-controls no-drag">
          <div className="bubble-ctl-group">
            {SHAPES.map((s) => (
              <button
                key={s}
                className={`bubble-ctl ${shape === s ? 'on' : ''}`}
                title={s}
                aria-label={`${s} shape`}
                onClick={() => changeShape(s)}
              >
                <span className={`shape-ico shape-${s}`} />
              </button>
            ))}
          </div>
          <span className="bubble-ctl-sep" />
          <div className="bubble-ctl-group">
            {SIZES.map((s) => (
              <button
                key={s.key}
                className={`bubble-ctl ${size === s.key ? 'on' : ''}`}
                title={`${s.key} size`}
                onClick={() => changeSize(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
