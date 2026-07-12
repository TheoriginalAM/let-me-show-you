import { useCallback, useEffect, useState } from 'react'
import { capture } from '../capture'
import { useRecorderStore, type DeviceOption } from '../store'
import { PermissionGate } from './PermissionGate'
import { PermissionNotice } from './PermissionNotice'
import { SourcePicker } from './SourcePicker'
import { DeviceSelects } from './DeviceSelects'
import { RecordingBar } from './RecordingBar'
import { ProcessingScreen } from './ProcessingScreen'
import { ReadyScreen } from './ReadyScreen'
import { ErrorScreen } from './ErrorScreen'
import { Settings } from './Settings'
import { Onboarding } from './Onboarding'
import { UpdateToast } from './UpdateToast'

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
  const onboardingComplete = useRecorderStore((s) => s.onboardingComplete)
  const [showSettings, setShowSettings] = useState(false)

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

    const onDeviceChange = (): void => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)

    // Subscribe BEFORE fetching the snapshot so a live push always wins.
    let gotLivePush = false
    const unsubscribe = window.recorder.onRecordingStatus((next) => {
      gotLivePush = true
      useRecorderStore.getState().setStatus(next)
      // If main ended the session on its own (e.g. a disk write error), release
      // the still-live capture in this renderer so the mic/screen aren't leaked.
      if (next.state === 'error') capture.forceRelease()
    })
    // The tray "Stop Recording" asks the renderer to stop the live MediaRecorder.
    const unsubscribeStop = window.recorder.onRequestStop(() => capture.stop())

    // Auth + upload state.
    const store = useRecorderStore.getState()
    const unsubscribeAuth = window.recorder.onAuthState((s) =>
      useRecorderStore.getState().setAuth(s),
    )
    const unsubscribeSignIn = window.recorder.onSignInStatus((s) =>
      useRecorderStore.getState().setSignIn(s),
    )
    const unsubscribeUpload = window.recorder.onUploadStatus((s) =>
      useRecorderStore.getState().setUpload(s),
    )
    const unsubscribeUpdate = window.recorder.onUpdateStatus((s) =>
      useRecorderStore.getState().setUpdate(s),
    )
    void window.recorder.getAuthState().then(store.setAuth)
    void window.recorder.getUploadStatus().then(store.setUpload)
    void window.recorder
      .getOnboardingComplete()
      .then((done) => useRecorderStore.getState().setOnboardingComplete(done))

    // Sync current recording state on mount (robust to renderer reloads).
    void window.recorder.getRecordingStatus().then((snapshot) => {
      if (!gotLivePush) useRecorderStore.getState().setStatus(snapshot)
      // Main thinks we're recording but this renderer has no live recorder (a
      // reload orphaned it) — end the session so the UI/temp file can recover.
      if ((snapshot.state === 'recording' || snapshot.state === 'paused') && !capture.isLive) {
        void window.recorder.abortRecording('Recording interrupted (the recorder was reloaded).')
      }
    })

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
      unsubscribe()
      unsubscribeStop()
      unsubscribeAuth()
      unsubscribeSignIn()
      unsubscribeUpload()
      unsubscribeUpdate()
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
    void capture.start({
      sourceId: store.selectedSourceId,
      micId: store.selectedMicId,
      cameraId: store.selectedCameraId,
    })
  }

  const { state } = status

  return (
    <div className="panel">
      <header className="titlebar">
        <span className="title-dot" />
        <span className="title-text">Let Me Show You</span>
        <div className="titlebar-actions">
          {onboardingComplete === true && (
            <button
              className={`win-icon no-drag ${showSettings ? 'active' : ''}`}
              title="Settings"
              onClick={() => setShowSettings((value) => !value)}
            >
              ⚙
            </button>
          )}
          <button
            className="win-close no-drag"
            title="Hide to tray"
            onClick={() => void window.recorder.hideControlWindow()}
          >
            ×
          </button>
        </div>
      </header>

      <main className="panel-body">
        {onboardingComplete === null ? (
          <div className="pane">
            <div className="picker-empty">Loading…</div>
          </div>
        ) : onboardingComplete === false ? (
          <div className="pane">
            <Onboarding onRecheck={recheck} />
          </div>
        ) : showSettings ? (
          <div className="pane">
            <Settings onClose={() => setShowSettings(false)} />
          </div>
        ) : state === 'recording' || state === 'paused' ? (
          <div className="pane">
            <RecordingBar />
          </div>
        ) : state === 'processing' ? (
          <div className="pane">
            <ProcessingScreen />
          </div>
        ) : state === 'ready' ? (
          <ReadyScreen />
        ) : state === 'error' ? (
          <div className="pane">
            <ErrorScreen />
          </div>
        ) : !permissions ? (
          <div className="pane">
            <div className="picker-empty">Checking permissions…</div>
          </div>
        ) : !screenGranted ? (
          <div className="pane">
            <PermissionGate permissions={permissions} onRecheck={recheck} />
          </div>
        ) : (
          <>
            <div className="source-scroll">
              <SourcePicker />
              <PermissionNotice permissions={permissions} />
            </div>
            <div className="panel-footer">
              <DeviceSelects />
              <button
                className="btn-record no-drag"
                disabled={!selectedSourceId}
                onClick={startRecording}
              >
                <span className="rec-dot" />
                Start recording
              </button>
            </div>
          </>
        )}
      </main>
      <UpdateToast />
    </div>
  )
}
