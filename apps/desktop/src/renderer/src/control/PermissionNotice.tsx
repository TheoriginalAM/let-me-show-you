import type { MediaPermissions, PermissionState } from '@shared/ipc'

const LABELS = { microphone: 'Microphone', camera: 'Camera' } as const

function isBlocked(state: PermissionState): boolean {
  return state === 'denied' || state === 'restricted'
}

/**
 * Inline notice shown in the picker when Microphone/Camera access is blocked
 * (the full-screen gate only covers Screen Recording). Each blocked device gets
 * a button that deep-links to its System Settings pane.
 */
export function PermissionNotice({ permissions }: { permissions: MediaPermissions }) {
  const blocked = (['microphone', 'camera'] as const).filter((target) =>
    isBlocked(permissions[target]),
  )
  if (blocked.length === 0) return null

  return (
    <div className="perm-notice">
      <p className="perm-notice-text">
        {blocked.map((target) => LABELS[target]).join(' and ')} access is blocked. Enable it in
        System Settings.
      </p>
      <div className="perm-notice-actions">
        {blocked.map((target) => (
          <button
            key={target}
            className="btn-ghost no-drag"
            onClick={() => void window.recorder.openPrivacySettings(target).catch(console.error)}
          >
            Open {LABELS[target]} settings
          </button>
        ))}
      </div>
    </div>
  )
}
