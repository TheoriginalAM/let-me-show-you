import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  type RecorderApi,
  type RecordingStatus,
  type StartRecordingPayload,
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
  toggleWebcam: (cameraId) => ipcRenderer.invoke(IPC.toggleWebcam, cameraId),
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
  platform: process.platform,
}

try {
  contextBridge.exposeInMainWorld('recorder', api)
} catch (error) {
  console.error('[preload] failed to expose recorder API:', error)
}
