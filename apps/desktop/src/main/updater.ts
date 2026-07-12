import { app, dialog, Notification, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC, type UpdateStatus } from '../shared/ipc'

// electron-updater is CommonJS; destructure the default export for ESM.
const { autoUpdater } = electronUpdater

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

let status: UpdateStatus = { phase: 'idle', version: null }
let interval: NodeJS.Timeout | null = null
// True while a user-initiated check is in flight, so its outcome can be shown
// in a dialog (up-to-date / downloading / error) — background checks stay silent.
let manualCheck = false
// Called whenever the update status changes, so the tray can show/hide its
// "Restart to Update" item.
let onStatusChange: (() => void) | null = null

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** Modal prompt to install a downloaded update and relaunch now. */
function promptRestart(version: string | null): void {
  const choice = dialog.showMessageBoxSync({
    type: 'info',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: `Update ready${version ? ` (v${version})` : ''}`,
    detail: 'Restart Let Me Show You to finish updating.',
  })
  if (choice === 0) restartToUpdate()
}

/**
 * Start background auto-updates against the GitHub Releases publish config.
 * Downloads updates silently; the renderer shows a subtle "Update ready" toast.
 * Because this is a tray app that's rarely fully quit (electron-updater only
 * installs on quit), a finished download also raises a passive notification and
 * can be installed on demand via the tray's "Check for Updates" / "Restart to
 * Update". Checks on launch and every 4 hours. No-op in dev (electron-updater
 * needs a packaged build).
 */
export function initAutoUpdates(
  getWindow: () => BrowserWindow | null,
  onChange?: () => void,
): void {
  onStatusChange = onChange ?? null
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (next: UpdateStatus): void => {
    status = next
    onStatusChange?.()
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.updateStatus, next)
  }

  autoUpdater.on('update-available', (info) => {
    send({ phase: 'downloading', version: info.version })
    if (manualCheck) {
      manualCheck = false
      void dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        message: `Downloading v${info.version}`,
        detail: "It's downloading in the background. You'll be notified when it's ready to install.",
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    if (manualCheck) {
      manualCheck = false
      void dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        message: "You're up to date",
        detail: `Let Me Show You v${app.getVersion()} is the latest version.`,
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    send({ phase: 'ready', version: info.version })
    if (manualCheck) {
      manualCheck = false
      promptRestart(info.version)
      return
    }
    // Background download: a passive nudge that won't interrupt a recording.
    if (Notification.isSupported()) {
      const note = new Notification({
        title: 'Update ready',
        body: `Let Me Show You v${info.version} is ready. Click to restart and install.`,
      })
      note.on('click', () => restartToUpdate())
      note.show()
    }
  })

  autoUpdater.on('error', (error) => {
    console.error('[updater] error:', error)
    if (manualCheck) {
      manualCheck = false
      void dialog.showMessageBox({
        type: 'error',
        buttons: ['OK'],
        message: 'Could not check for updates',
        detail: String(error?.message ?? error),
      })
    }
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((error) => console.error('[updater] check failed:', error))
  }

  check()
  interval = setInterval(check, FOUR_HOURS_MS)
  app.on('before-quit', () => {
    if (interval) clearInterval(interval)
  })
}

/**
 * User-initiated "Check for Updates…" from the tray. Surfaces the result in a
 * dialog: up-to-date, downloading, ready-to-restart, or an error.
 */
export async function checkForUpdatesManual(): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: 'info',
      buttons: ['OK'],
      message: 'Updates are only available in the installed app.',
    })
    return
  }
  // Already downloaded and waiting — go straight to the restart prompt.
  if (status.phase === 'ready') {
    promptRestart(status.version)
    return
  }
  manualCheck = true
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    manualCheck = false
    await dialog.showMessageBox({
      type: 'error',
      buttons: ['OK'],
      message: 'Could not check for updates',
      detail: String((error as Error)?.message ?? error),
    })
  }
}

/** Install the downloaded update and relaunch (toast button / tray menu). */
export function restartToUpdate(): void {
  autoUpdater.quitAndInstall()
}
