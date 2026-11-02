// Shrink an uploaded image in the browser before it's saved (as a data URL).

export async function resizeImage(
  file: File,
  opts: {
    maxWidth: number
    maxHeight: number
    /** 'cover' crops to exactly maxWidth x maxHeight; 'contain' fits inside. */
    fit?: 'cover' | 'contain'
    type?: 'image/jpeg' | 'image/png' | 'image/webp'
    quality?: number
  },
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image')
  const bitmap = await createImageBitmap(file)
  const fit = opts.fit ?? 'contain'
  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height
  let w: number
  let h: number
  if (fit === 'cover') {
    const target = opts.maxWidth / opts.maxHeight
    if (sw / sh > target) {
      sw = Math.round(sh * target)
      sx = Math.round((bitmap.width - sw) / 2)
    } else {
      sh = Math.round(sw / target)
      sy = Math.round((bitmap.height - sh) / 2)
    }
    const scale = Math.min(1, opts.maxWidth / sw)
    w = Math.max(1, Math.round(sw * scale))
    h = Math.max(1, Math.round(sh * scale))
  } else {
    const scale = Math.min(1, opts.maxWidth / sw, opts.maxHeight / sh)
    w = Math.max(1, Math.round(sw * scale))
    h = Math.max(1, Math.round(sh * scale))
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unsupported')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)
  bitmap.close?.()
  return canvas.toDataURL(opts.type ?? 'image/jpeg', opts.quality ?? 0.82)
}
