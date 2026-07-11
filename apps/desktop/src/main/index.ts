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
import { IPC } from '../shared/ipc'
import { createRecorder } from './recorder'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'

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

const recorder = createRecorder()

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
    recorder,
    showWebcam,
    hideWebcam,
    getWebcamCamera: () => currentCameraId,
    hideControlWindow: () => controlWindow?.hide(),
    quit,
  })

  // Mirror recording status to the control panel renderer.
  recorder.onChange((status) => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send(IPC.recordingStatus, status)
    }
  })

  if (process.platform === 'darwin') {
    console.log('[main] media access:', {
      screen: systemPreferences.getMediaAccessStatus('screen'),
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      camera: systemPreferences.getMediaAccessStatus('camera'),
    })
  }

  createTray({ recorder, showControlWindow, quit })
  controlWindow = createControlWindow()

  app.on('activate', () => {
    showControlWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // Stay resident in the tray on macOS; quit on other platforms.
  if (process.platform !== 'darwin') app.quit()
})
