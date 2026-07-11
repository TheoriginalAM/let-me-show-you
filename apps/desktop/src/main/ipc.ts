import { desktopCapturer, ipcMain, shell, systemPreferences } from 'electron'
import {
  IPC,
  type CaptureSource,
  type MediaPermissions,
  type PermissionState,
  type PermissionTarget,
} from '../shared/ipc'
import type { Recorder } from './recorder'

export interface IpcContext {
  recorder: Recorder
  showWebcam: (cameraId: string) => void
  hideWebcam: () => void
  getWebcamCamera: () => string | null
  hideControlWindow: () => void
  quit: () => void
}

// Ids from the most recent list-sources call; used to validate the sourceId
// handed back to start-recording so the renderer can't inject an arbitrary one.
let knownSourceIds = new Set<string>()

const PRIVACY_URLS: Record<PermissionTarget, string> = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
}

function permissionFor(target: PermissionTarget): PermissionState {
  // getMediaAccessStatus is only meaningful on macOS/Windows; elsewhere the OS
  // does not gate these, so treat as granted.
  if (process.platform !== 'darwin' && process.platform !== 'win32') return 'granted'
  try {
    return systemPreferences.getMediaAccessStatus(target)
  } catch {
    return 'unknown'
  }
}

function isPermissionTarget(value: unknown): value is PermissionTarget {
  return value === 'screen' || value === 'microphone' || value === 'camera'
}

/** Device ids from enumerateDevices are opaque strings; bound them defensively. */
function sanitizeDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0 || value.length > 512) return null
  return value
}

export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC.listSources, async (): Promise<CaptureSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: true,
    })
    knownSourceIds = new Set(sources.map((source) => source.id))
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      appIconDataUrl:
        source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
      displayId: source.display_id || null,
    }))
  })

  ipcMain.handle(IPC.getPermissions, (): MediaPermissions => ({
    screen: permissionFor('screen'),
    microphone: permissionFor('microphone'),
    camera: permissionFor('camera'),
  }))

  ipcMain.handle(IPC.openPrivacySettings, async (_event, target: unknown) => {
    if (!isPermissionTarget(target)) {
      throw new Error('Invalid privacy-settings target')
    }
    await shell.openExternal(PRIVACY_URLS[target])
  })

  ipcMain.handle(IPC.startRecording, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid start-recording payload')
    }
    const { sourceId, micId, cameraId } = payload as Record<string, unknown>
    if (typeof sourceId !== 'string' || !knownSourceIds.has(sourceId)) {
      throw new Error('Unknown or missing sourceId')
    }
    const validated = {
      sourceId,
      micId: sanitizeDeviceId(micId),
      cameraId: sanitizeDeviceId(cameraId),
    }
    // STUB: real capture is intentionally not implemented yet.
    console.log('[main] start-recording (stub):', validated)
    ctx.recorder.start()
  })

  ipcMain.handle(IPC.stopRecording, () => {
    console.log('[main] stop-recording (stub)')
    ctx.recorder.stop()
  })

  ipcMain.handle(IPC.pauseRecording, () => {
    ctx.recorder.pause()
  })

  ipcMain.handle(IPC.resumeRecording, () => {
    ctx.recorder.resume()
  })

  ipcMain.handle(IPC.toggleWebcam, (_event, cameraId: unknown) => {
    const id = sanitizeDeviceId(cameraId)
    if (id) ctx.showWebcam(id)
    else ctx.hideWebcam()
  })

  ipcMain.handle(IPC.getWebcamCamera, () => ctx.getWebcamCamera())

  ipcMain.handle(IPC.getRecordingStatus, () => ctx.recorder.getStatus())

  ipcMain.handle(IPC.hideControlWindow, () => {
    ctx.hideControlWindow()
  })

  ipcMain.handle(IPC.quitApp, () => {
    ctx.quit()
  })
}
