import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type AuthState,
  type RecorderApi,
  type RecordingStatus,
  type SignInStatus,
  type StartRecordingPayload,
  type UpdateStatus,
  type UploadStatus,
} from '../shared/ipc'

/**
 * The renderer never imports `electron` directly. This preload is the only
 * bridge — it runs with contextIsolation on and exposes a typed, minimal API.
 */
const api: RecorderApi = {
  listSources: () => ipcRenderer.invoke(IPC.listSources),
  getPermissions: () => ipcRenderer.invoke(IPC.getPermissions),
  openPrivacySettings: (target) => ipcRenderer.invoke(IPC.openPrivacySettings, target),
  startRecording: (payload: StartRecordingPayload) =>
    ipcRenderer.invoke(IPC.startRecording, payload),
  writeChunk: (chunk) => ipcRenderer.invoke(IPC.writeChunk, chunk),
  pauseRecording: () => ipcRenderer.invoke(IPC.pauseRecording),
  resumeRecording: () => ipcRenderer.invoke(IPC.resumeRecording),
  finishRecording: () => ipcRenderer.invoke(IPC.finishRecording),
  abortRecording: (message) => ipcRenderer.invoke(IPC.abortRecording, message),
  dismissResult: () => ipcRenderer.invoke(IPC.dismissResult),
  revealInFinder: (filePath) => ipcRenderer.invoke(IPC.revealInFinder, filePath),
  requestMediaAccess: (target) => ipcRenderer.invoke(IPC.requestMediaAccess, target),
  toggleWebcam: (cameraId) => ipcRenderer.invoke(IPC.toggleWebcam, cameraId),
  setWebcamShape: (shape) => ipcRenderer.invoke(IPC.setWebcamShape, shape),
  setWebcamSize: (size) => ipcRenderer.invoke(IPC.setWebcamSize, size),
  getWebcamConfig: () => ipcRenderer.invoke(IPC.getWebcamConfig),
  selectArea: () => ipcRenderer.invoke(IPC.selectArea),
  cancelAreaSelect: () => ipcRenderer.invoke(IPC.cancelAreaSelect),
  reportArea: (rect) => ipcRenderer.send(IPC.areaSelected, rect),
  getWebcamCamera: () => ipcRenderer.invoke(IPC.getWebcamCamera),
  getRecordingStatus: () => ipcRenderer.invoke(IPC.getRecordingStatus),
  hideControlWindow: () => ipcRenderer.invoke(IPC.hideControlWindow),
  quit: () => ipcRenderer.invoke(IPC.quitApp),
  onRecordingStatus: (cb) => {
    const listener = (_event: IpcRendererEvent, status: RecordingStatus): void => cb(status)
    ipcRenderer.on(IPC.recordingStatus, listener)
    return () => ipcRenderer.removeListener(IPC.recordingStatus, listener)
  },
  onRequestStop: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.requestStop, listener)
    return () => ipcRenderer.removeListener(IPC.requestStop, listener)
  },
  onWebcamCamera: (cb) => {
    const listener = (_event: IpcRendererEvent, cameraId: string | null): void => cb(cameraId)
    ipcRenderer.on(IPC.webcamCamera, listener)
    return () => ipcRenderer.removeListener(IPC.webcamCamera, listener)
  },

  // Auth (device flow)
  signIn: () => ipcRenderer.invoke(IPC.signIn),
  cancelSignIn: () => ipcRenderer.invoke(IPC.cancelSignIn),
  signOut: () => ipcRenderer.invoke(IPC.signOut),
  getAuthState: () => ipcRenderer.invoke(IPC.getAuthState),
  onAuthState: (cb) => {
    const listener = (_event: IpcRendererEvent, state: AuthState): void => cb(state)
    ipcRenderer.on(IPC.authState, listener)
    return () => ipcRenderer.removeListener(IPC.authState, listener)
  },
  onSignInStatus: (cb) => {
    const listener = (_event: IpcRendererEvent, status: SignInStatus): void => cb(status)
    ipcRenderer.on(IPC.signInStatus, listener)
    return () => ipcRenderer.removeListener(IPC.signInStatus, listener)
  },

  // Upload & share
  startUpload: (payload) => ipcRenderer.invoke(IPC.startUpload, payload),
  retryUpload: () => ipcRenderer.invoke(IPC.retryUpload),
  getUploadStatus: () => ipcRenderer.invoke(IPC.getUploadStatus),
  listWorkspaces: () => ipcRenderer.invoke(IPC.listWorkspaces),
  onUploadStatus: (cb) => {
    const listener = (_event: IpcRendererEvent, status: UploadStatus): void => cb(status)
    ipcRenderer.on(IPC.uploadStatus, listener)
    return () => ipcRenderer.removeListener(IPC.uploadStatus, listener)
  },
  openExternalUrl: (url) => ipcRenderer.invoke(IPC.openExternalUrl, url),

  // Onboarding
  getOnboardingComplete: () => ipcRenderer.invoke(IPC.getOnboardingComplete),
  completeOnboarding: () => ipcRenderer.invoke(IPC.completeOnboarding),

  // Auto-update
  restartToUpdate: () => ipcRenderer.invoke(IPC.restartToUpdate),
  onUpdateStatus: (cb) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus): void => cb(status)
    ipcRenderer.on(IPC.updateStatus, listener)
    return () => ipcRenderer.removeListener(IPC.updateStatus, listener)
  },

  platform: process.platform,
}

try {
  contextBridge.exposeInMainWorld('recorder', api)
} catch (error) {
  console.error('[preload] failed to expose recorder API:', error)
}
