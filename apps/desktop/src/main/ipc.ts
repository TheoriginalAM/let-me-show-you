import { isAbsolute, join, relative, resolve } from 'path'
import { app, desktopCapturer, ipcMain, shell, systemPreferences } from 'electron'
import {
  IPC,
  type AuthState,
  type CaptureSource,
  type MediaPermissions,
  type PermissionState,
  type PermissionTarget,
  type StartUploadPayload,
  type UploadStatus,
} from '../shared/ipc'
import type { RecordingSession } from './recording-session'
import { getOnboardingComplete, setOnboardingComplete } from './settings-store'
import { restartToUpdate } from './updater'

export interface IpcContext {
  session: RecordingSession
  showWebcam: (cameraId: string) => void
  hideWebcam: () => void
  getWebcamCamera: () => string | null
  hideControlWindow: () => void
  quit: () => void
  // auth + upload
  signIn: () => Promise<void>
  cancelSignIn: () => void
  signOut: () => void
  getAuthState: () => AuthState
  startUpload: (payload: StartUploadPayload) => Promise<void>
  retryUpload: () => Promise<void>
  getUploadStatus: () => UploadStatus
}

/** Confine an uploadable path to the app's own recordings directory. */
function isRecordingPath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  const root = resolve(join(app.getPath('videos'), 'LetMeShowYou'))
  const rel = relative(root, resolve(filePath))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
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

/** Only allow revealing files that are true descendants of the app's dirs. */
function isRevealablePath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  const resolved = resolve(filePath)
  const allowedRoots = [join(app.getPath('videos'), 'LetMeShowYou'), app.getPath('temp')]
  return allowedRoots.some((root) => {
    // path.relative rejects `..` traversal and sibling dirs that merely share a
    // name prefix (e.g. `<root>-exfil`), unlike a bare startsWith.
    const rel = relative(resolve(root), resolved)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  })
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

  // Show the native macOS TCC prompt for mic/camera. Unlike getMediaAccessStatus
  // (read-only) or getUserMedia (unreliable at triggering the prompt in a
  // packaged app), this reliably prompts a 'not-determined' user AND registers
  // the app in System Settings so a later denial can be reversed there.
  ipcMain.handle(IPC.requestMediaAccess, async (_event, target: unknown): Promise<boolean> => {
    if (target !== 'microphone' && target !== 'camera') {
      throw new Error('Invalid media-access target')
    }
    if (process.platform !== 'darwin') return true
    try {
      return await systemPreferences.askForMediaAccess(target)
    } catch {
      return false
    }
  })

  ipcMain.handle(IPC.openPrivacySettings, async (_event, target: unknown) => {
    if (!isPermissionTarget(target)) throw new Error('Invalid privacy-settings target')
    await shell.openExternal(PRIVACY_URLS[target])
  })

  // ---- Recording lifecycle ----
  ipcMain.handle(IPC.startRecording, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid start-recording payload')
    }
    const { sourceId } = payload as Record<string, unknown>
    if (typeof sourceId !== 'string' || !knownSourceIds.has(sourceId)) {
      throw new Error('Unknown or missing sourceId')
    }
    ctx.session.begin()
  })

  ipcMain.handle(IPC.writeChunk, async (_event, chunk: unknown) => {
    // Bounded (~64MB) to reject anything absurd; a 1s chunk at 8Mbps is ~1MB.
    if (!(chunk instanceof Uint8Array) || chunk.byteLength > 64 * 1024 * 1024) {
      throw new Error('Invalid recording chunk')
    }
    // Awaited so main's write backpressure throttles the renderer.
    await ctx.session.writeChunk(chunk)
  })

  ipcMain.handle(IPC.pauseRecording, () => ctx.session.pause())
  ipcMain.handle(IPC.resumeRecording, () => ctx.session.resume())
  ipcMain.handle(IPC.finishRecording, () => ctx.session.finish())

  ipcMain.handle(IPC.abortRecording, (_event, message: unknown) => {
    const text = typeof message === 'string' && message.length <= 500 ? message : 'Recording failed'
    return ctx.session.abort(text)
  })

  ipcMain.handle(IPC.dismissResult, () => ctx.session.dismiss())
  ipcMain.handle(IPC.getRecordingStatus, () => ctx.session.getStatus())

  ipcMain.handle(IPC.revealInFinder, (_event, filePath: unknown) => {
    if (!isRevealablePath(filePath)) throw new Error('Refusing to reveal path outside app folders')
    shell.showItemInFolder(resolve(filePath))
  })

  // ---- Webcam + window ----
  ipcMain.handle(IPC.toggleWebcam, (_event, cameraId: unknown) => {
    const id =
      typeof cameraId === 'string' && cameraId.length > 0 && cameraId.length <= 512
        ? cameraId
        : null
    if (id) ctx.showWebcam(id)
    else ctx.hideWebcam()
  })

  ipcMain.handle(IPC.getWebcamCamera, () => ctx.getWebcamCamera())
  ipcMain.handle(IPC.hideControlWindow, () => ctx.hideControlWindow())
  ipcMain.handle(IPC.quitApp, () => ctx.quit())

  // ---- Auth (device flow) ----
  ipcMain.handle(IPC.signIn, () => ctx.signIn())
  ipcMain.handle(IPC.cancelSignIn, () => ctx.cancelSignIn())
  ipcMain.handle(IPC.signOut, () => ctx.signOut())
  ipcMain.handle(IPC.getAuthState, () => ctx.getAuthState())

  // ---- Upload & share ----
  ipcMain.handle(IPC.startUpload, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid upload payload')
    const { filePath, title } = payload as Record<string, unknown>
    if (!isRecordingPath(filePath)) throw new Error('Refusing to upload a file outside recordings')
    const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 200) : ''
    return ctx.startUpload({ filePath, title: cleanTitle })
  })
  ipcMain.handle(IPC.retryUpload, () => ctx.retryUpload())
  ipcMain.handle(IPC.getUploadStatus, () => ctx.getUploadStatus())

  ipcMain.handle(IPC.openExternalUrl, (_event, url: unknown) => {
    if (typeof url !== 'string') throw new Error('Invalid url')
    try {
      const { protocol } = new URL(url)
      if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
    } catch {
      // ignore malformed url
    }
  })

  // ---- Onboarding ----
  ipcMain.handle(IPC.getOnboardingComplete, () => getOnboardingComplete())
  ipcMain.handle(IPC.completeOnboarding, () => setOnboardingComplete(true))

  // ---- Auto-update ----
  ipcMain.handle(IPC.restartToUpdate, () => restartToUpdate())
}
