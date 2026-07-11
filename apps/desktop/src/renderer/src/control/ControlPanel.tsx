import { useCallback, useEffect } from 'react'
import { useRecorderStore, type DeviceOption } from '../store'
import { PermissionGate } from './PermissionGate'
import { PermissionNotice } from './PermissionNotice'
import { SourcePicker } from './SourcePicker'
import { DeviceSelects } from './DeviceSelects'
import { RecordingBar } from './RecordingBar'

async function enumerate(): Promise<{ mics: DeviceOption[]; cameras: DeviceOption[] }> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const mics: DeviceOption[] = []
  const cameras: DeviceOption[] = []
  for (const device of devices) {
    if (device.kind === 'audioinput') {
      mics.push({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${mics.length + 1}`,
      })
    } else if (device.kind === 'videoinput') {
      cameras.push({
        deviceId: device.deviceId,
        label: device.label || `Camera ${cameras.length + 1}`,
      })
    }
  }
  return { mics, cameras }
}

export function ControlPanel() {
  const permissions = useRecorderStore((s) => s.permissions)
  const status = useRecorderStore((s) => s.status)
  const selectedSourceId = useRecorderStore((s) => s.selectedSourceId)
  const selectedCameraId = useRecorderStore((s) => s.selectedCameraId)

  const refreshPermissions = useCallback(async () => {
    useRecorderStore.getState().setPermissions(await window.recorder.getPermissions())
  }, [])

  const refreshSources = useCallback(async () => {
    const store = useRecorderStore.getState()
    store.setLoadingSources(true)
    try {
      store.setSources(await window.recorder.listSources())
    } catch (error) {
      // getSources throws if screen-recording access is revoked; leave the list
      // empty rather than surfacing an unhandled rejection.
      console.error('[renderer] listSources failed:', error)
      store.setSources([])
    } finally {
      useRecorderStore.getState().setLoadingSources(false)
    }
  }, [])

  const refreshDevices = useCallback(async () => {
    const { mics, cameras } = await enumerate()
    useRecorderStore.getState().setDevices(mics, cameras)
  }, [])

  useEffect(() => {
    void refreshPermissions()
    void refreshDevices()
    // Sync current recording state on mount (robust to renderer reloads mid-record).
    void window.recorder.getRecordingStatus().then((next) => {
      useRecorderStore.getState().setStatus(next)
    })
    const onDeviceChange = (): void => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    const unsubscribe = window.recorder.onRecordingStatus((next) =>
      useRecorderStore.getState().setStatus(next),
    )
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
      unsubscribe()
    }
  }, [refreshPermissions, refreshDevices])

  // Keep the webcam bubble in sync with the selected camera. Driving this from
  // state (not the onChange handler) also covers the camera being unplugged,
  // which resets the selection to null and must hide the bubble.
  useEffect(() => {
    void window.recorder.toggleWebcam(selectedCameraId).catch((error) => {
      console.error('[renderer] toggleWebcam failed:', error)
    })
  }, [selectedCameraId])

  const screenGranted = permissions?.screen === 'granted'
  useEffect(() => {
    if (screenGranted) void refreshSources()
  }, [screenGranted, refreshSources])

  function recheck(): void {
    // Re-enumerate too: labels only populate once mic/camera access is granted,
    // and macOS doesn't reliably emit 'devicechange' on a permission grant.
    void refreshPermissions()
    void refreshDevices()
  }

  function startRecording(): void {
    const store = useRecorderStore.getState()
    if (!store.selectedSourceId) return
    void window.recorder
      .startRecording({
        sourceId: store.selectedSourceId,
        micId: store.selectedMicId,
        cameraId: store.selectedCameraId,
      })
      .catch((error) => console.error('[renderer] startRecording failed:', error))
  }

  const recording = status.state !== 'idle'

  return (
    <div className="panel">
      <header className="titlebar">
        <span className="title-dot" />
        <span className="title-text">Let Me Show You</span>
        <button
          className="win-close no-drag"
          title="Hide to tray"
          onClick={() => void window.recorder.hideControlWindow()}
        >
          ×
        </button>
      </header>

      <main className="panel-body">
        {recording ? (
          <RecordingBar />
        ) : !permissions ? (
          <div className="picker-empty">Checking permissions…</div>
        ) : !screenGranted ? (
          <PermissionGate permissions={permissions} onRecheck={recheck} />
        ) : (
          <>
            <SourcePicker />
            <PermissionNotice permissions={permissions} />
            <DeviceSelects />
            <button
              className="btn-record no-drag"
              disabled={!selectedSourceId}
              onClick={startRecording}
            >
              Start recording
            </button>
          </>
        )}
      </main>
    </div>
  )
}
