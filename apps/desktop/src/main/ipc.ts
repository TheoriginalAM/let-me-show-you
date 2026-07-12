import { isAbsolute, join, relative, resolve } from 'path'
import { app, desktopCapturer, ipcMain, shell, systemPreferences } from 'electron'
import {
  IPC,
  type AreaRect,
  type AuthState,
  type CaptureSource,
  type MediaPermissions,
  type PermissionState,
  type PermissionTarget,
  type StartRecordingPayload,
  type StartUploadPayload,
  type UploadStatus,
  type WebcamConfig,
  type WebcamShape,
  type WebcamSize,
  type WorkspacesResult,
} from '../shared/ipc'
import type { RecordingSession } from './recording-session'
import {
  getOnboardingComplete,
  getWebcamConfig,
  setOnboardingComplete,
  setWebcamShape,
  setWebcamSize,
} from './settings-store'
import { restartToUpdate } from './updater'

export interface IpcContext {
  session: RecordingSession
  showWebcam: (cameraId: string) => void
  hideWebcam: () => void
  getWebcamCamera: () => string | null
  resizeWebcam: (size: WebcamSize) => void
  selectArea: () => Promise<AreaRect | null>
  cancelAreaSelect: () => void
  showRecordingIndicator: (payload: StartRecordingPayload) => void
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
  listWorkspaces: () => Promise<WorkspacesResult | null>
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

  // ---- Webcam bubble customization ----
  ipcMain.handle(IPC.getWebcamConfig, (): WebcamConfig => getWebcamConfig())

  ipcMain.handle(IPC.setWebcamShape, (_event, shape: unknown) => {
    if (shape !== 'circle' && shape !== 'rounded' && shape !== 'square') {
      throw new Error('Invalid webcam shape')
    }
    setWebcamShape(shape as WebcamShape)
  })

  ipcMain.handle(IPC.setWebcamSize, (_event, size: unknown) => {
    if (size !== 'small' && size !== 'medium' && size !== 'large') {
      throw new Error('Invalid webcam size')
    }
    setWebcamSize(size as WebcamSize)
    ctx.resizeWebcam(size as WebcamSize)
  })

  // ---- Area (region) selection ----
  ipcMain.handle(IPC.selectArea, (): Promise<AreaRect | null> => ctx.selectArea())
  ipcMain.handle(IPC.cancelAreaSelect, () => ctx.cancelAreaSelect())

  // ---- Recording lifecycle ----
  ipcMain.handle(IPC.startRecording, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid start-recording payload')
    }
    const { mode, sourceId } = payload as Record<string, unknown>
    // Camera-only has no desktop source; every other mode must reference a source
    // we actually handed out (so the renderer can't inject an arbitrary id).
    if (mode !== 'camera' && (typeof sourceId !== 'string' || !knownSourceIds.has(sourceId))) {
      throw new Error('Unknown or missing sourceId')
    }
    ctx.session.begin()
    ctx.showRecordingIndicator(payload as StartRecordingPayload)
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
    const { filePath, title, password, workspaceId } = payload as Record<string, unknown>
    if (!isRecordingPath(filePath)) throw new Error('Refusing to upload a file outside recordings')
    const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 200) : ''
    // Preserve the optional share password (server enforces the min length); an
    // empty/absent value means "no protection". Dropping it here was silently
    // un-protecting recordings even when the user set a password.
    const cleanPassword = typeof password === 'string' && password.length > 0 ? password : null
    const cleanWorkspaceId = typeof workspaceId === 'string' && workspaceId ? workspaceId : null
    return ctx.startUpload({
      filePath,
      title: cleanTitle,
      password: cleanPassword,
      workspaceId: cleanWorkspaceId,
    })
  })
  ipcMain.handle(IPC.retryUpload, () => ctx.retryUpload())
  ipcMain.handle(IPC.getUploadStatus, () => ctx.getUploadStatus())
  ipcMain.handle(IPC.listWorkspaces, () => ctx.listWorkspaces())

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
