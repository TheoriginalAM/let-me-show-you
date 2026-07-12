import type { RecordingMode } from '@shared/ipc'
import { useRecorderStore } from '../store'

const MicIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
    <path d="M19 12a7 7 0 0 1-14 0M12 19v3" />
  </svg>
)

const CameraIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 7l-7 5 7 5V7Z" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
)

export function DeviceSelects({ mode }: { mode: RecordingMode }) {
  const mics = useRecorderStore((s) => s.mics)
  const cameras = useRecorderStore((s) => s.cameras)
  const selectedMicId = useRecorderStore((s) => s.selectedMicId)
  const selectedCameraId = useRecorderStore((s) => s.selectedCameraId)
  const selectMic = useRecorderStore((s) => s.selectMic)
  const selectCamera = useRecorderStore((s) => s.selectCamera)

  function onCameraChange(value: string): void {
    // The webcam bubble is toggled by ControlPanel's effect on selectedCameraId,
    // so this only needs to update state (which also handles device removal).
    selectCamera(value === 'off' ? null : value)
  }

  return (
    <div className="device-row">
      <div className={`device-chip ${selectedMicId ? 'on' : ''}`}>
        <span className="device-icon" aria-hidden>
          {MicIcon}
        </span>
        <select
          className="no-drag"
          aria-label="Microphone"
          value={selectedMicId ?? ''}
          onChange={(event) => selectMic(event.target.value || null)}
        >
          {mics.length === 0 && <option value="">No microphone</option>}
          {mics.map((mic) => (
            <option key={mic.deviceId} value={mic.deviceId}>
              {mic.label}
            </option>
          ))}
        </select>
        <span className="chev" aria-hidden>
          ▾
        </span>
      </div>

      {mode !== 'camera' && (
        <div className={`device-chip ${selectedCameraId ? 'on' : ''}`}>
          <span className="device-icon" aria-hidden>
            {CameraIcon}
          </span>
          <select
            className="no-drag"
            aria-label="Webcam overlay"
            value={selectedCameraId ?? 'off'}
            onChange={(event) => onCameraChange(event.target.value)}
          >
            <option value="off">No webcam</option>
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label}
              </option>
            ))}
          </select>
          <span className="chev" aria-hidden>
            ▾
          </span>
        </div>
      )}
    </div>
  )
}
