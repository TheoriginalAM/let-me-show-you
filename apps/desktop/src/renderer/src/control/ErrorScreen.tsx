import { useRecorderStore } from '../store'
import { Icon } from '../brand'

export function ErrorScreen() {
  const error = useRecorderStore((s) => s.status.error)
  if (!error) return null
  const recoveredPath = error.recoveredWebmPath

  return (
    <div className="error-screen">
      <div className="error-icon">
        <Icon name="warning" size={26} />
      </div>
      <h2 className="error-title">Recording failed</h2>
      <p className="error-message">{error.message}</p>
      {recoveredPath ? (
        <p className="error-recovery">
          Your raw recording was kept, so nothing is lost. You can recover it from the webm file.
        </p>
      ) : null}

      <div className="ready-actions">
        {recoveredPath ? (
          <button
            className="btn-secondary no-drag"
            onClick={() => void window.recorder.revealInFinder(recoveredPath).catch(console.error)}
          >
            Reveal raw file
          </button>
        ) : null}
        <button className="btn-record no-drag" onClick={() => void window.recorder.dismissResult()}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
