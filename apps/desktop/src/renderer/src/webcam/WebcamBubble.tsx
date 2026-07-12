import { useEffect, useRef, useState } from 'react'

export function WebcamBubble() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          video: { deviceId: { exact: cameraId }, width: 480, height: 480 },
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

  return (
    <div className="bubble">
      {cameraId ? (
        <video ref={videoRef} className="bubble-video" autoPlay playsInline muted />
      ) : null}
      {error ? <div className="bubble-error">{error}</div> : null}
    </div>
  )
}
