import { useEffect, useState } from 'react'
import { useRecorderStore } from '../store'

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function RecordingBar() {
  const status = useRecorderStore((s) => s.status)
  const [, setTick] = useState(0)

  // Re-render every 500ms while running so the elapsed timer advances.
  useEffect(() => {
    if (status.state !== 'recording') return
    const id = window.setInterval(() => setTick((count) => count + 1), 500)
    return () => window.clearInterval(id)
  }, [status.state])

  const elapsedMs =
    status.accumulatedMs +
    (status.state === 'recording' && status.startedAt ? Date.now() - status.startedAt : 0)
  const paused = status.state === 'paused'

  return (
    <div className="recording">
      <div className="rec-status">
        <span className={`rec-dot ${paused ? 'paused' : ''}`} />
        <span className="rec-label">{paused ? 'Paused' : 'Recording'}</span>
      </div>

      <div className="rec-timer">{formatElapsed(elapsedMs)}</div>

      <div className="rec-actions">
        {paused ? (
          <button
            className="btn-secondary no-drag"
            onClick={() => void window.recorder.resumeRecording()}
          >
            Resume
          </button>
        ) : (
          <button
            className="btn-secondary no-drag"
            onClick={() => void window.recorder.pauseRecording()}
          >
            Pause
          </button>
        )}
        <button className="btn-stop no-drag" onClick={() => void window.recorder.stopRecording()}>
          Stop
        </button>
      </div>
    </div>
  )
}
