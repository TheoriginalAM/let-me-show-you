import { useState } from 'react'
import { useRecorderStore } from '../store'

/**
 * A subtle, dismissible toast shown when an update has been downloaded. Never
 * forces a restart — the user installs it when they choose (and it also installs
 * automatically on next quit).
 */
export function UpdateToast() {
  const update = useRecorderStore((s) => s.update)
  // Track the dismissed version so a later update still surfaces its own toast.
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)

  if (update.phase !== 'ready') return null
  if (dismissedVersion !== null && dismissedVersion === update.version) return null

  return (
    <div className="update-toast">
      <div className="update-toast-text">
        <div className="update-toast-title">
          Update ready{update.version ? ` · v${update.version}` : ''}
        </div>
        <div className="update-toast-sub">Restart to install.</div>
      </div>
      <div className="update-toast-actions">
        <button className="btn-mini no-drag" onClick={() => void window.recorder.restartToUpdate()}>
          Restart
        </button>
        <button
          className="update-toast-close no-drag"
          title="Dismiss"
          onClick={() => setDismissedVersion(update.version)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
