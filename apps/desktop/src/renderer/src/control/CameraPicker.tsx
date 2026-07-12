import { useRecorderStore } from '../store'

/** Camera mode: pick which camera to record (the live feed shows in the preview). */
export function CameraPicker() {
  const cameras = useRecorderStore((s) => s.cameras)
  const cameraModeDeviceId = useRecorderStore((s) => s.cameraModeDeviceId)
  const selectCameraModeDevice = useRecorderStore((s) => s.selectCameraModeDevice)
  const active = cameraModeDeviceId ?? cameras[0]?.deviceId ?? null

  if (cameras.length === 0) return <div className="picker-empty">No camera found.</div>

  return (
    <div className="cam-pick">
      {cameras.map((c) => (
        <button
          key={c.deviceId}
          className={`cam-opt no-drag ${active === c.deviceId ? 'on' : ''}`}
          onClick={() => selectCameraModeDevice(c.deviceId)}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
