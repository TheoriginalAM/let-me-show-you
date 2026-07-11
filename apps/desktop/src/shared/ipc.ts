/**
 * Shared IPC contract between the Electron main process and the renderers.
 *
 * This module is imported by main, preload, and both renderer views, so it must
 * stay free of any `electron` import — the sandboxed renderer has no access to
 * Node or Electron and can only reach the main process through the preload
 * bridge defined here.
 */

export const IPC = {
  // renderer -> main (invoke/handle)
  listSources: 'list-sources',
  getPermissions: 'get-permissions',
  openPrivacySettings: 'open-privacy-settings',
  startRecording: 'start-recording',
  stopRecording: 'stop-recording',
  pauseRecording: 'pause-recording',
  resumeRecording: 'resume-recording',
  toggleWebcam: 'toggle-webcam',
  getWebcamCamera: 'get-webcam-camera',
  getRecordingStatus: 'get-recording-status',
  hideControlWindow: 'hide-control-window',
  quitApp: 'quit-app',
  // main -> renderer (events)
  recordingStatus: 'recording-status',
  webcamCamera: 'webcam-camera',
} as const

export type SourceType = 'screen' | 'window'

/** A capturable screen or window, as surfaced by the main process. */
export interface CaptureSource {
  id: string
  name: string
  type: SourceType
  /** PNG data URL of the live thumbnail. */
  thumbnailDataUrl: string
  /** PNG data URL of the window's app icon, if any. */
  appIconDataUrl: string | null
  displayId: string | null
}

export interface StartRecordingPayload {
  sourceId: string
  micId: string | null
  cameraId: string | null
}

export type PermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export type PermissionTarget = 'screen' | 'microphone' | 'camera'

export type MediaPermissions = Record<PermissionTarget, PermissionState>

export type RecordingState = 'idle' | 'recording' | 'paused'

export interface RecordingStatus {
  state: RecordingState
  /** Epoch ms when the current running segment started (null unless recording). */
  startedAt: number | null
  /** Elapsed ms accumulated across previous running segments (before pauses). */
  accumulatedMs: number
}

/** The API the preload script exposes on `window.recorder`. */
export interface RecorderApi {
  listSources: () => Promise<CaptureSource[]>
  getPermissions: () => Promise<MediaPermissions>
  openPrivacySettings: (target: PermissionTarget) => Promise<void>
  startRecording: (payload: StartRecordingPayload) => Promise<void>
  stopRecording: () => Promise<void>
  pauseRecording: () => Promise<void>
  resumeRecording: () => Promise<void>
  toggleWebcam: (cameraId: string | null) => Promise<void>
  /** (webcam window) current selected camera id, resolved without a race. */
  getWebcamCamera: () => Promise<string | null>
  /** Current recording status, so a freshly mounted renderer can sync immediately. */
  getRecordingStatus: () => Promise<RecordingStatus>
  hideControlWindow: () => Promise<void>
  quit: () => Promise<void>
  /** Subscribe to recording-status changes; returns an unsubscribe fn. */
  onRecordingStatus: (cb: (status: RecordingStatus) => void) => () => void
  /** (webcam window) subscribe to camera-id changes; returns an unsubscribe fn. */
  onWebcamCamera: (cb: (cameraId: string | null) => void) => () => void
  platform: string
}
