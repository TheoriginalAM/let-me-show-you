import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import type { RecordingSession } from './recording-session'

export interface TrayContext {
  session: RecordingSession
  requestStop: () => void
  showControlWindow: () => void
  quit: () => void
}

/**
 * Build a 22x22 template tray icon (a filled circle) at runtime so we don't need
 * to ship a binary asset. Template images are drawn monochrome by macOS to match
 * the menu bar; the RGB channels are ignored, only the alpha mask matters.
 */
function createTrayIcon(): NativeImage {
  const size = 22
  const buffer = Buffer.alloc(size * size * 4)
  const center = (size - 1) / 2
  const radius = size / 2 - 3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4
      const inside = Math.hypot(x - center, y - center) <= radius
      buffer[offset] = 0 // B
      buffer[offset + 1] = 0 // G
      buffer[offset + 2] = 0 // R
      buffer[offset + 3] = inside ? 255 : 0 // A
    }
  }
  const image = nativeImage.createFromBitmap(buffer, { width: size, height: size })
  image.setTemplateImage(true)
  return image
}

export function createTray(ctx: TrayContext): Tray {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Let Me Show You')

  const rebuildMenu = (): void => {
    const active = ctx.session.isActive()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          // Stopping asks the renderer (which owns the MediaRecorder) to stop;
          // starting surfaces the panel so a source is picked and validated.
          label: active ? 'Stop Recording' : 'Start Recording',
          click: () => (active ? ctx.requestStop() : ctx.showControlWindow()),
        },
        { type: 'separator' },
        { label: 'Show Recorder', click: () => ctx.showControlWindow() },
        { type: 'separator' },
        { label: 'Quit', click: () => ctx.quit() },
      ]),
    )
  }

  rebuildMenu()
  ctx.session.onChange(rebuildMenu)
  tray.on('click', () => ctx.showControlWindow())

  return tray
}
