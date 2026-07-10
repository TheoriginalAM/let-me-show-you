import { join } from 'path'
import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { APP_NAME } from '@lmsy/shared'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    show: false,
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security: the renderer is fully isolated from Node/Electron. It talks
      // to the main process only through the preload contextBridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open only http(s) links externally; deny everything else. Never open a new
  // Electron window for renderer-requested URLs.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url)
      if (protocol === 'https:' || protocol === 'http:') {
        void shell.openExternal(url)
      }
    } catch {
      // Malformed URL — ignore.
    }
    return { action: 'deny' }
  })

  // Lock top-level navigation to the app's own origin (dev server or file://).
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const currentUrl = mainWindow.webContents.getURL()
    if (currentUrl && new URL(navigationUrl).origin !== new URL(currentUrl).origin) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[main] ${APP_NAME} renderer loaded`)
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Strict Content-Security-Policy for the packaged app. Left off in dev so the
  // Vite dev server (inline scripts + HMR websocket) keeps working.
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'"],
        },
      })
    })
  }

  // Example IPC handler wired to the preload bridge.
  ipcMain.handle('ping', () => 'pong')

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
