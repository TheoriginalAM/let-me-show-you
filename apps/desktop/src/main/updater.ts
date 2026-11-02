import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  autoUpdater as nativeUpdater,
  dialog,
  Notification,
  type BrowserWindow,
} from 'electron'
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
// Lets the window's hide-on-close guard know a restart-to-install is quitting.
let prepareQuit: (() => void) | null = null

/**
 * A small updater log at <userData>/logs/updater.log (capped at ~1 MB), so a
 * failed update leaves a trail. electron-updater logs to it too.
 */
const fileLog = (() => {
  let path: string | null = null
  const write = (level: string, parts: unknown[]): void => {
    try {
      if (!path) {
        const dir = join(app.getPath('userData'), 'logs')
        mkdirSync(dir, { recursive: true })
        path = join(dir, 'updater.log')
      }
      try {
        if (statSync(path).size > 1_000_000) truncateSync(path, 0)
      } catch {
        // No file yet.
      }
      const text = parts
        .map((x) => (x instanceof Error ? (x.stack ?? x.message) : String(x)))
        .join(' ')
      appendFileSync(path, `${new Date().toISOString()} ${level} ${text}\n`)
    } catch {
      // Logging must never break updating.
    }
  }
  return {
    info: (...a: unknown[]) => write('info', a),
    warn: (...a: unknown[]) => write('warn', a),
    error: (...a: unknown[]) => write('error', a),
    debug: (...a: unknown[]) => write('debug', a),
  }
})()

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
  opts: { onChange?: () => void; prepareQuit?: () => void } = {},
): void {
  onStatusChange = opts.onChange ?? null
  prepareQuit = opts.prepareQuit ?? null
  if (!app.isPackaged) return

  autoUpdater.logger = fileLog
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
        detail:
          "It's downloading in the background. You'll be notified when it's ready to install.",
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

  // Ready means installable. On macOS electron-updater reports "downloaded" as
  // soon as it starts handing the file to Squirrel.Mac, which then needs a few
  // seconds to copy it; quitting in that window loses the update. So on macOS
  // wait for Squirrel's own update-downloaded before saying it's ready.
  const markReady = (version: string | null): void => {
    if (status.phase === 'ready') return
    send({ phase: 'ready', version })
    fileLog.info(`update ready to install: v${version ?? '?'}`)
    if (manualCheck) {
      manualCheck = false
      promptRestart(version)
      return
    }
    // Background download: a passive nudge that won't interrupt a recording.
    if (Notification.isSupported()) {
      const note = new Notification({
        title: 'Update ready',
        body: `Let Me Show You v${version} is ready. Click to restart and install.`,
      })
      note.on('click', () => restartToUpdate())
      note.show()
    }
  }

  let downloadedVersion: string | null = null
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version
    if (process.platform === 'darwin') {
      send({ phase: 'downloading', version: info.version })
      fileLog.info(`v${info.version} downloaded; waiting for Squirrel.Mac to stage it`)
    } else {
      markReady(info.version)
    }
  })
  if (process.platform === 'darwin') {
    nativeUpdater.on('update-downloaded', () => markReady(downloadedVersion))
  }

  autoUpdater.on('error', (error) => {
    console.error('[updater] error:', error)
    fileLog.error('updater error:', error)
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

/**
 * Install the downloaded update and relaunch (toast button / tray menu).
 * quitAndInstall closes every window before the app's before-quit fires, so the
 * window's hide-on-close guard must be told first or it cancels the restart.
 */
export function restartToUpdate(): void {
  fileLog.info('restart to update requested')
  prepareQuit?.()
  autoUpdater.quitAndInstall()
}
