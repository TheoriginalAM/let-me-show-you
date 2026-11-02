import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import type { UpcomingBooking } from '../shared/ipc'
import { callTimeLabel } from './calendar'
import type { RecordingSession } from './recording-session'
import type { UpdateStatus } from '../shared/ipc'

export interface TrayContext {
  session: RecordingSession
  requestStop: () => void
  showControlWindow: () => void
  quit: () => void
  checkForUpdates: () => void
  getUpdateStatus: () => UpdateStatus
  restartToUpdate: () => void
  /** The next call the user hosts, if any (shown at the top of the menu). */
  getNextCall: () => UpcomingBooking | null
  joinCall: (booking: UpcomingBooking) => void
}

export interface TrayHandle {
  tray: Tray
  /** Rebuild the menu (e.g. after the update status changes). */
  refresh: () => void
}

// The logo mark (a pointer circled with a marker) in a 22pt box, for the menu bar.
const CURSOR: [number, number][] = [
  [8.4, 7.5],
  [8.4, 19.3],
  [11.6, 16.5],
  [13.7, 20.9],
  [16.0, 19.9],
  [13.9, 15.5],
  [18.2, 15.3],
]
// A loop tilted 10 degrees, like the logo's.
const RING = { cx: 9.7, cy: 7.0, rx: 5.9, ry: 3.85, tilt: (-10 * Math.PI) / 180, width: 1.7 }

function insidePolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distanceToPolygon(x: number, y: number, poly: [number, number][]): number {
  if (insidePolygon(x, y, poly)) return 0
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!
    const [bx, by] = poly[i]!
    const t = Math.max(
      0,
      Math.min(
        1,
        ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2),
      ),
    )
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))))
  }
  return best
}

/** Is this point (in 22pt units) part of the mark? The ring stops short of the pointer. */
function inMark(x: number, y: number): boolean {
  const d = distanceToPolygon(x, y, CURSOR)
  if (d === 0) return true
  const dx = x - RING.cx
  const dy = y - RING.cy
  const u = dx * Math.cos(-RING.tilt) - dy * Math.sin(-RING.tilt)
  const v = dx * Math.sin(-RING.tilt) + dy * Math.cos(-RING.tilt)
  const r = Math.hypot(u / RING.rx, v / RING.ry)
  const onRing = Math.abs(r - 1) * Math.min(RING.rx, RING.ry) < RING.width / 2
  return onRing && d > 1.2
}

function markBitmap(scale: number): Buffer {
  const size = 22 * scale
  const samples = 4
  const buffer = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          if (inMark((px + (sx + 0.5) / samples) / scale, (py + (sy + 0.5) / samples) / scale))
            hits++
        }
      }
      // Template images use only the alpha channel (macOS tints them to the menu bar).
      buffer[(py * size + px) * 4 + 3] = Math.round((hits / (samples * samples)) * 255)
    }
  }
  return buffer
}

/**
 * The tray icon, drawn at runtime (1x and 2x) so we don't ship a binary asset.
 * A template image: macOS draws it in the menu bar's colour.
 */
function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromBitmap(markBitmap(1), { width: 22, height: 22 })
  image.addRepresentation({ scaleFactor: 2, width: 44, height: 44, buffer: markBitmap(2) })
  image.setTemplateImage(true)
  return image
}

export function createTray(ctx: TrayContext): TrayHandle {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Let Me Show You')

  const rebuildMenu = (): void => {
    const active = ctx.session.isActive()
    const updateReady = ctx.getUpdateStatus().phase === 'ready'
    const updateVersion = ctx.getUpdateStatus().version
    const next = ctx.getNextCall()
    const startsIn = next ? new Date(next.startsAt).getTime() - Date.now() : Infinity
    tray.setContextMenu(
      Menu.buildFromTemplate([
        ...(next
          ? [
              {
                label: `${startsIn <= 0 ? 'Now' : 'Next call'}: ${callTimeLabel(next.startsAt)}, ${next.guestName}`,
                click: () => ctx.joinCall(next),
              },
              { type: 'separator' as const },
            ]
          : []),
        {
          // Stopping asks the renderer (which owns the MediaRecorder) to stop;
          // starting surfaces the panel so a source is picked and validated.
          label: active ? 'Stop Recording' : 'Start Recording',
          click: () => (active ? ctx.requestStop() : ctx.showControlWindow()),
        },
        { type: 'separator' },
        { label: 'Show Recorder', click: () => ctx.showControlWindow() },
        { type: 'separator' },
        // When a download is waiting, offer a one-click restart-to-install; the
        // tray app rarely fully quits, so autoInstallOnAppQuit alone never fires.
        ...(updateReady
          ? [
              {
                label: `Restart to Update${updateVersion ? ` (v${updateVersion})` : ''}`,
                click: () => ctx.restartToUpdate(),
              },
            ]
          : [{ label: 'Check for Updates…', click: () => ctx.checkForUpdates() }]),
        { type: 'separator' },
        { label: 'Quit', click: () => ctx.quit() },
      ]),
    )
  }

  rebuildMenu()
  ctx.session.onChange(rebuildMenu)
  tray.on('click', () => ctx.showControlWindow())

  return { tray, refresh: rebuildMenu }
}
