import { useRecorderStore } from '../store'

export function ProcessingScreen() {
  const progress = useRecorderStore((s) => s.status.progress)
  const pct = Math.round(progress * 100)

  return (
    <div className="processing">
      <div className="rec-status">
        <span className="proc-spinner" />
        <span className="rec-label">Converting to MP4…</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-pct">{pct}%</div>
    </div>
  )
}
