import type { MediaPermissions, PermissionState, PermissionTarget } from '@shared/ipc'

const LABELS: Record<PermissionTarget, string> = {
  screen: 'Screen Recording',
  microphone: 'Microphone',
  camera: 'Camera',
}

function statusText(state: PermissionState): string {
  switch (state) {
    case 'granted':
      return 'Allowed'
    case 'denied':
      return 'Denied'
    case 'restricted':
      return 'Restricted'
    case 'not-determined':
      return 'Not set'
    default:
      return 'Unknown'
  }
}

const TARGETS: PermissionTarget[] = ['screen', 'microphone', 'camera']

export function PermissionGate({
  permissions,
  onRecheck,
}: {
  permissions: MediaPermissions
  onRecheck: () => void
}) {
  return (
    <div className="gate">
      <div className="gate-icon">🎥</div>
      <h2 className="gate-title">Screen recording access needed</h2>
      <p className="gate-body">
        To capture your screen, allow <strong>Let Me Show You</strong> under Screen Recording in
        System Settings, then reopen the app.
      </p>

      <ul className="perm-list">
        {TARGETS.map((target) => (
          <li key={target} className="perm-row">
            <span>{LABELS[target]}</span>
            <span className={`badge badge-${permissions[target]}`}>
              {statusText(permissions[target])}
            </span>
          </li>
        ))}
      </ul>

      <button
        className="btn-record no-drag"
        onClick={() => void window.recorder.openPrivacySettings('screen').catch(console.error)}
      >
        Open System Settings
      </button>
      <button className="btn-ghost no-drag" onClick={onRecheck}>
        Re-check permissions
      </button>
    </div>
  )
}
