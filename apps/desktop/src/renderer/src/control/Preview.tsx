import { useEffect, useRef } from 'react'
import { useRecorderStore } from '../store'

/** The prominent preview at the top of the recorder — live camera or a source thumbnail. */
export function Preview() {
  const mode = useRecorderStore((s) => s.mode)
  const sources = useRecorderStore((s) => s.sources)
  const selectedSourceId = useRecorderStore((s) => s.selectedSourceId)
  const cameraModeDeviceId = useRecorderStore((s) => s.cameraModeDeviceId)
  const cameras = useRecorderStore((s) => s.cameras)
  const areaRect = useRecorderStore((s) => s.areaRect)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const cameraId = mode === 'camera' ? (cameraModeDeviceId ?? cameras[0]?.deviceId ?? null) : null

  // Live camera preview (camera mode only).
  useEffect(() => {
    if (mode !== 'camera' || !cameraId) return
    let stream: MediaStream | null = null
    let cancelled = false
    void (async () => {
      await window.recorder.requestMediaAccess('camera').catch(() => false)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: cameraId } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
      } catch {
        /* preview is best-effort */
      }
    })()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [mode, cameraId])

  if (mode === 'camera') {
    return (
      <div className="preview">
        {cameraId ? (
          <video ref={videoRef} className="preview-cam" autoPlay playsInline muted />
        ) : (
          <div className="preview-empty">No camera found</div>
        )}
      </div>
    )
  }

  const selected =
    sources.find((s) => s.id === selectedSourceId) ??
    (mode === 'area' ? sources.find((s) => s.type === 'screen') : undefined)

  return (
    <div className="preview">
      {selected ? (
        <img className="preview-img" src={selected.thumbnailDataUrl} alt="" draggable={false} />
      ) : (
        <div className="preview-empty">
          {mode === 'screen'
            ? 'Choose a screen below'
            : mode === 'window'
              ? 'Choose a window below'
              : 'Choose an area below'}
        </div>
      )}
      {mode === 'area' && (
        <div className="preview-badge">
          {areaRect ? `Area · ${areaRect.width}×${areaRect.height}` : 'No area selected'}
        </div>
      )}
    </div>
  )
}
