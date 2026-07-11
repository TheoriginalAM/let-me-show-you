import { useRecorderStore } from '../store'

export function DeviceSelects() {
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
    <div className="devices">
      <label className="field">
        <span className="field-label">Microphone</span>
        <select
          className="no-drag"
          value={selectedMicId ?? ''}
          onChange={(event) => selectMic(event.target.value || null)}
        >
          {mics.length === 0 && <option value="">No microphones found</option>}
          {mics.map((mic) => (
            <option key={mic.deviceId} value={mic.deviceId}>
              {mic.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Camera</span>
        <select
          className="no-drag"
          value={selectedCameraId ?? 'off'}
          onChange={(event) => onCameraChange(event.target.value)}
        >
          <option value="off">Off</option>
          {cameras.map((camera) => (
            <option key={camera.deviceId} value={camera.deviceId}>
              {camera.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
