import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC, type UpdateStatus } from '../shared/ipc'

// electron-updater is CommonJS; destructure the default export for ESM.
const { autoUpdater } = electronUpdater

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

let status: UpdateStatus = { phase: 'idle', version: null }
let interval: NodeJS.Timeout | null = null

export function getUpdateStatus(): UpdateStatus {
  return status
}

/**
 * Start background auto-updates against the GitHub Releases publish config.
 * Downloads updates silently; the renderer shows a subtle "Update ready" toast
 * (never a forced restart) once an update is downloaded. Checks on launch and
 * every 4 hours. No-op in dev (electron-updater needs a packaged build).
 */
export function initAutoUpdates(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (next: UpdateStatus): void => {
    status = next
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.updateStatus, next)
  }

  autoUpdater.on('update-available', (info) =>
    send({ phase: 'downloading', version: info.version }),
  )
  autoUpdater.on('update-downloaded', (info) => send({ phase: 'ready', version: info.version }))
  autoUpdater.on('error', (error) => console.error('[updater] error:', error))

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((error) => console.error('[updater] check failed:', error))
  }

  check()
  interval = setInterval(check, FOUR_HOURS_MS)
  app.on('before-quit', () => {
    if (interval) clearInterval(interval)
  })
}

/** Install the downloaded update and relaunch (triggered from the toast button). */
export function restartToUpdate(): void {
  autoUpdater.quitAndInstall()
}
