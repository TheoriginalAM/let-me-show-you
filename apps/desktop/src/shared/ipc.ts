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
  requestMediaAccess: 'request-media-access',
  openPrivacySettings: 'open-privacy-settings',
  // Webcam bubble customization.
  setWebcamShape: 'set-webcam-shape',
  setWebcamSize: 'set-webcam-size',
  getWebcamConfig: 'get-webcam-config',
  // Area (region) selection overlay.
  selectArea: 'select-area',
  cancelAreaSelect: 'cancel-area-select',
  areaSelected: 'area-selected',
  startRecording: 'start-recording',
  writeChunk: 'write-chunk',
  pauseRecording: 'pause-recording',
  resumeRecording: 'resume-recording',
  finishRecording: 'finish-recording',
  abortRecording: 'abort-recording',
  dismissResult: 'dismiss-result',
  revealInFinder: 'reveal-in-finder',
  toggleWebcam: 'toggle-webcam',
  getWebcamCamera: 'get-webcam-camera',
  getRecordingStatus: 'get-recording-status',
  hideControlWindow: 'hide-control-window',
  quitApp: 'quit-app',
  // auth (device flow) + upload
  signIn: 'sign-in',
  cancelSignIn: 'cancel-sign-in',
  signOut: 'sign-out',
  getAuthState: 'get-auth-state',
  startUpload: 'start-upload',
  retryUpload: 'retry-upload',
  getUploadStatus: 'get-upload-status',
  openExternalUrl: 'open-external-url',
  // onboarding + auto-update
  getOnboardingComplete: 'get-onboarding-complete',
  completeOnboarding: 'complete-onboarding',
  restartToUpdate: 'restart-to-update',
  // main -> renderer (events)
  recordingStatus: 'recording-status',
  requestStop: 'request-stop',
  webcamCamera: 'webcam-camera',
  authState: 'auth-state',
  signInStatus: 'sign-in-status',
  uploadStatus: 'upload-status',
  updateStatus: 'update-status',
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

/** What the recorder captures. */
export type RecordingMode = 'screen' | 'window' | 'area' | 'camera'

/**
 * A selected screen region, in DIP relative to the display's top-left, plus the
 * display's id and DIP size so the renderer can scale the crop to the captured
 * video (which may be downscaled from native resolution).
 */
export interface AreaRect {
  x: number
  y: number
  width: number
  height: number
  displayId: number
  displayWidth: number
  displayHeight: number
}

export interface StartRecordingPayload {
  mode: RecordingMode
  /** desktopCapturer id for screen/window/area; null for camera-only. */
  sourceId: string | null
  /** Electron display id of the captured screen (screen mode), for the indicator. */
  displayId: string | null
  micId: string | null
  /** In 'camera' mode: the camera to record. In screen/window: the webcam overlay (or null). */
  cameraId: string | null
  /** Crop rectangle for 'area' mode. */
  areaRect: AreaRect | null
}

/** Webcam bubble appearance. */
export type WebcamShape = 'circle' | 'rounded' | 'square'
export type WebcamSize = 'small' | 'medium' | 'large'
export interface WebcamConfig {
  shape: WebcamShape
  size: WebcamSize
}

export type PermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export type PermissionTarget = 'screen' | 'microphone' | 'camera'

export type MediaPermissions = Record<PermissionTarget, PermissionState>

/**
 * The full session lifecycle:
 *   idle → recording ⇄ paused → processing → ready
 *                                          ↘ error
 */
export type RecordingState = 'idle' | 'recording' | 'paused' | 'processing' | 'ready' | 'error'

/** The finished MP4, shown on the "Recording ready" screen. */
export interface RecordingResult {
  filePath: string
  fileName: string
  /** JPEG data URL of a frame grabbed ~1s in, or null if it couldn't be made. */
  thumbnailDataUrl: string | null
  durationSeconds: number
}

/** A failed recording. The webm is preserved for recovery when possible. */
export interface RecordingError {
  message: string
  recoveredWebmPath: string | null
}

export interface RecordingStatus {
  state: RecordingState
  /** Epoch ms when the current running segment started (null unless recording). */
  startedAt: number | null
  /** Elapsed ms accumulated across previous running segments (before pauses). */
  accumulatedMs: number
  /** Transcode progress in [0, 1] while `state === 'processing'`. */
  progress: number
  /** Present only when `state === 'ready'`. */
  result: RecordingResult | null
  /** Present only when `state === 'error'`. */
  error: RecordingError | null
}

/** Whether the desktop app holds a valid API token for the web backend. */
export interface AuthState {
  signedIn: boolean
}

export type SignInPhase = 'idle' | 'starting' | 'waiting' | 'success' | 'error'

/** Progress of the device-authorization sign-in flow. */
export interface SignInStatus {
  phase: SignInPhase
  /** Short code the user confirms in the browser (shown while waiting). */
  userCode: string | null
  verificationUri: string | null
  message: string | null
}

export type UploadPhase = 'idle' | 'creating' | 'uploading' | 'done' | 'error'

/** Progress of an upload-and-share of a finished recording. */
export interface UploadStatus {
  phase: UploadPhase
  /** Upload progress in [0, 1] while `phase === 'uploading'`. */
  progress: number
  /** Present when `phase === 'done'` (also copied to the clipboard). */
  shareUrl: string | null
  /** Present when `phase === 'error'`. */
  message: string | null
}

export interface StartUploadPayload {
  filePath: string
  title: string
  /** Optional share password. When set, the recording is password-protected. */
  password?: string | null
}

export type UpdatePhase = 'idle' | 'downloading' | 'ready'

/** Auto-update progress. The renderer only surfaces a toast when `phase === 'ready'`. */
export interface UpdateStatus {
  phase: UpdatePhase
  /** The version that is ready to install (present when `phase === 'ready'`). */
  version: string | null
}

/** The API the preload script exposes on `window.recorder`. */
export interface RecorderApi {
  listSources: () => Promise<CaptureSource[]>
  getPermissions: () => Promise<MediaPermissions>
  /**
   * Trigger the native macOS camera/microphone permission prompt (a no-op that
   * resolves `true` off macOS). Only 'microphone' and 'camera' can be requested
   * programmatically — screen recording must be granted in System Settings.
   * Returns whether access is granted.
   */
  requestMediaAccess: (target: 'microphone' | 'camera') => Promise<boolean>
  openPrivacySettings: (target: PermissionTarget) => Promise<void>
  /** Begin a session: opens the temp .webm file (call after acquiring streams). */
  startRecording: (payload: StartRecordingPayload) => Promise<void>
  /** Stream a MediaRecorder chunk to the main-process temp file. */
  writeChunk: (chunk: Uint8Array) => Promise<void>
  pauseRecording: () => Promise<void>
  resumeRecording: () => Promise<void>
  /** Finalize: close the temp file and transcode to MP4. */
  finishRecording: () => Promise<void>
  /** Abort with an error (disk/capture failure); preserves the webm if it has data. */
  abortRecording: (message: string) => Promise<void>
  /** Dismiss the ready/error screen and return to idle. */
  dismissResult: () => Promise<void>
  /** Reveal a file in Finder/Explorer. */
  revealInFinder: (filePath: string) => Promise<void>
  toggleWebcam: (cameraId: string | null) => Promise<void>
  /** Customize the webcam bubble; persisted and pushed live to the bubble window. */
  setWebcamShape: (shape: WebcamShape) => Promise<void>
  setWebcamSize: (size: WebcamSize) => Promise<void>
  getWebcamConfig: () => Promise<WebcamConfig>
  /** Open the drag-to-select region overlay; resolves to the chosen rect or null. */
  selectArea: () => Promise<AreaRect | null>
  cancelAreaSelect: () => Promise<void>
  /** (area overlay window) report the drag rect in CSS px, or null to cancel. */
  reportArea: (rect: { x: number; y: number; width: number; height: number } | null) => void
  /** (webcam window) current selected camera id, resolved without a race. */
  getWebcamCamera: () => Promise<string | null>
  /** Current recording status, so a freshly mounted renderer can sync immediately. */
  getRecordingStatus: () => Promise<RecordingStatus>
  hideControlWindow: () => Promise<void>
  quit: () => Promise<void>
  /** Subscribe to recording-status changes; returns an unsubscribe fn. */
  onRecordingStatus: (cb: (status: RecordingStatus) => void) => () => void
  /** Main asks the renderer to stop the MediaRecorder (e.g. from the tray). */
  onRequestStop: (cb: () => void) => () => void
  /** (webcam window) subscribe to camera-id changes; returns an unsubscribe fn. */
  onWebcamCamera: (cb: (cameraId: string | null) => void) => () => void

  // ---- Auth (device flow) ----
  /** Start the device sign-in flow (opens the browser + polls). */
  signIn: () => Promise<void>
  cancelSignIn: () => Promise<void>
  signOut: () => Promise<void>
  getAuthState: () => Promise<AuthState>
  onAuthState: (cb: (state: AuthState) => void) => () => void
  onSignInStatus: (cb: (status: SignInStatus) => void) => () => void

  // ---- Upload & share ----
  startUpload: (payload: StartUploadPayload) => Promise<void>
  retryUpload: () => Promise<void>
  getUploadStatus: () => Promise<UploadStatus>
  onUploadStatus: (cb: (status: UploadStatus) => void) => () => void
  /** Open an http(s) URL in the default browser (e.g. the share link). */
  openExternalUrl: (url: string) => Promise<void>

  // ---- First-run onboarding ----
  /** Whether the user has finished (or skipped) the first-run onboarding. */
  getOnboardingComplete: () => Promise<boolean>
  /** Mark onboarding as done so it isn't shown again. */
  completeOnboarding: () => Promise<void>

  // ---- Auto-update ----
  /** Quit and install a downloaded update (from the "Update ready" toast). */
  restartToUpdate: () => Promise<void>
  /** Subscribe to auto-update status; returns an unsubscribe fn. */
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void

  platform: string
}
