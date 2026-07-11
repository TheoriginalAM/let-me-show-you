import { formatDuration } from '@lmsy/shared'
import { useRecorderStore } from '../store'

export function ReadyScreen() {
  const result = useRecorderStore((s) => s.status.result)
  if (!result) return null

  return (
    <div className="ready">
      <div className="ready-check">✓</div>
      <h2 className="ready-title">Recording ready</h2>

      {result.thumbnailDataUrl ? (
        <img className="ready-thumb" src={result.thumbnailDataUrl} alt="Recording preview" />
      ) : null}

      <div className="ready-meta">
        <div className="ready-name" title={result.fileName}>
          {result.fileName}
        </div>
        <div className="ready-sub">{formatDuration(result.durationSeconds)}</div>
        <div className="ready-path" title={result.filePath}>
          {result.filePath}
        </div>
      </div>

      <div className="ready-actions">
        <button
          className="btn-record no-drag"
          onClick={() => void window.recorder.revealInFinder(result.filePath).catch(console.error)}
        >
          Reveal in Finder
        </button>
        <button className="btn-secondary no-drag" disabled title="Coming in the next phase">
          Upload &amp; share
        </button>
      </div>

      <button className="btn-ghost no-drag" onClick={() => void window.recorder.dismissResult()}>
        Done
      </button>
    </div>
  )
}
