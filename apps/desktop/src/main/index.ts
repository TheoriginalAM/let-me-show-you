import { join } from 'path'
import {
  app,
  BrowserWindow,
  session,
  shell,
  systemPreferences,
  type WebPreferences,
} from 'electron'
import { APP_NAME } from '@lmsy/shared'
import { IPC, type SignInStatus, type StartUploadPayload, type UploadStatus } from '../shared/ipc'
import { RecordingSession } from './recording-session'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'
import { clearToken, hasToken } from './token-store'
import { cancelSignIn, runSignIn } from './device-auth'
import { runUpload } from './uploader'

const isDev = !app.isPackaged
const devServerUrl = process.env.ELECTRON_RENDERER_URL
const rendererFile = join(__dirname, '../renderer/index.html')
const preloadScript = join(__dirname, '../preload/index.js')

const baseWebPreferences: WebPreferences = {
  preload: preloadScript,
  // Security: renderer stays isolated from Node/Electron (see preload bridge).
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}

let controlWindow: BrowserWindow | null = null
let webcamWindow: BrowserWindow | null = null
let currentCameraId: string | null = null
let isQuitting = false

const recordingSession = new RecordingSession()

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (isDev && devServerUrl) {
    void win.loadURL(hash ? `${devServerUrl}#${hash}` : devServerUrl)
  } else {
    void win.loadFile(rendererFile, hash ? { hash } : undefined)
  }
}

/** Deny new windows for external URLs (open in the browser) and lock navigation. */
function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url)
      if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url)
    } catch {
      // ignore malformed url
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const current = win.webContents.getURL()
    if (current && new URL(navigationUrl).origin !== new URL(current).origin) {
      event.preventDefault()
    }
  })
}

function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 520,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    backgroundColor: '#0b0b12',
    title: APP_NAME,
    webPreferences: baseWebPreferences,
  })
  hardenWindow(win)
  win.on('ready-to-show', () => win.show())
  win.on('close', (event) => {
    // Keep the app alive in the tray; hide instead of really closing.
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })
  win.webContents.on('did-finish-load', () => {
    console.log(`[main] ${APP_NAME} control panel loaded`)
  })
  loadRenderer(win)
  return win
}

function createWebcamWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 200,
    height: 200,
    show: false,
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: baseWebPreferences,
  })
  hardenWindow(win)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRenderer(win, 'webcam')
  return win
}

function showWebcam(cameraId: string): void {
  currentCameraId = cameraId
  if (!webcamWindow || webcamWindow.isDestroyed()) {
    webcamWindow = createWebcamWindow()
    webcamWindow.on('closed', () => {
      webcamWindow = null
    })
  }
  const win = webcamWindow
  // Read the LIVE currentCameraId at fire time (not the captured argument), so a
  // camera turned Off/switched before the first load wins over this deferred
  // send — otherwise a stale id could acquire the camera in a hidden window.
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.webcamCamera, currentCameraId)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
  win.showInactive()
}

function hideWebcam(): void {
  currentCameraId = null
  if (webcamWindow && !webcamWindow.isDestroyed()) {
    // Tell the (still-loaded) renderer to release the camera, then hide.
    webcamWindow.webContents.send(IPC.webcamCamera, null)
    webcamWindow.hide()
  }
}

function showControlWindow(): void {
  if (!controlWindow || controlWindow.isDestroyed()) {
    controlWindow = createControlWindow()
  } else {
    controlWindow.show()
    controlWindow.focus()
  }
}

function quit(): void {
  isQuitting = true
  app.quit()
}

// Ask the renderer (which owns the MediaRecorder) to stop, and surface the panel
// so the user sees the processing/ready screen.
function requestStop(): void {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send(IPC.requestStop)
    controlWindow.show()
  }
}

// ---- Auth + upload state (broadcast to the control window) ----
let uploadStatus: UploadStatus = { phase: 'idle', progress: 0, shareUrl: null, message: null }
let lastUploadPayload: StartUploadPayload | null = null

function sendToControl(channel: string, payload?: unknown): void {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send(channel, payload)
  }
}

function broadcastAuthState(): void {
  sendToControl(IPC.authState, { signedIn: hasToken() })
}

async function signIn(): Promise<void> {
  await runSignIn((status: SignInStatus) => sendToControl(IPC.signInStatus, status))
  broadcastAuthState()
}

function signOut(): void {
  clearToken()
  broadcastAuthState()
}

async function startUpload(payload: StartUploadPayload): Promise<void> {
  lastUploadPayload = payload
  await runUpload(payload, (status: UploadStatus) => {
    uploadStatus = status
    sendToControl(IPC.uploadStatus, status)
  })
}

async function retryUpload(): Promise<void> {
  if (lastUploadPayload) await startUpload(lastUploadPayload)
}

app.whenReady().then(() => {
  // Allow the renderers to use camera/microphone (getUserMedia). The OS still
  // gates access separately on macOS via the system permission prompts.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  // Strict CSP for the packaged app (left off in dev so Vite HMR works). Allows
  // data: images for the source thumbnails and blob:/inline for media + styles.
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'",
          ],
        },
      })
    })
  }

  registerIpcHandlers({
    session: recordingSession,
    showWebcam,
    hideWebcam,
    getWebcamCamera: () => currentCameraId,
    hideControlWindow: () => controlWindow?.hide(),
    quit,
    signIn,
    cancelSignIn,
    signOut,
    getAuthState: () => ({ signedIn: hasToken() }),
    startUpload,
    retryUpload,
    getUploadStatus: () => uploadStatus,
  })

  // Mirror recording status to the control panel renderer.
  recordingSession.onChange((status) => {
    sendToControl(IPC.recordingStatus, status)
    // A new recording (or dismissal) clears any prior upload result.
    if (
      (status.state === 'recording' || status.state === 'idle') &&
      uploadStatus.phase !== 'idle'
    ) {
      uploadStatus = { phase: 'idle', progress: 0, shareUrl: null, message: null }
      lastUploadPayload = null
      sendToControl(IPC.uploadStatus, uploadStatus)
    }
  })

  if (process.platform === 'darwin') {
    console.log('[main] media access:', {
      screen: systemPreferences.getMediaAccessStatus('screen'),
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      camera: systemPreferences.getMediaAccessStatus('camera'),
    })
  }

  createTray({ session: recordingSession, requestStop, showControlWindow, quit })
  controlWindow = createControlWindow()

  app.on('activate', () => {
    showControlWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  recordingSession.dispose() // kill any in-flight ffmpeg transcode
})

app.on('window-all-closed', () => {
  // Stay resident in the tray on macOS; quit on other platforms.
  if (process.platform !== 'darwin') app.quit()
})
