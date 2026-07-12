import { useEffect, useRef, useState } from 'react'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Fullscreen drag-to-select overlay. Reports the chosen rectangle (in CSS px,
 * which equals DIP relative to the display it covers) back to main, which maps
 * it to captured-video pixels for the crop.
 */
export function AreaOverlay() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.recorder.reportArea(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onDown(e: React.MouseEvent): void {
    dragging.current = true
    setStart({ x: e.clientX, y: e.clientY })
    setRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
  }

  function onMove(e: React.MouseEvent): void {
    if (!dragging.current || !start) return
    setRect({
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      width: Math.abs(e.clientX - start.x),
      height: Math.abs(e.clientY - start.y),
    })
  }

  function onUp(): void {
    dragging.current = false
    if (rect && rect.width >= 8 && rect.height >= 8) {
      window.recorder.reportArea({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    } else {
      setRect(null)
      setStart(null)
    }
  }

  return (
    <div className="area-overlay" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}>
      {rect ? (
        <div
          className="area-sel"
          style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        >
          {rect.width >= 48 && rect.height >= 24 && (
            <span className="area-dim">
              {Math.round(rect.width)} × {Math.round(rect.height)}
            </span>
          )}
        </div>
      ) : (
        <div className="area-hint-center">Drag to select an area to record · Esc to cancel</div>
      )}
    </div>
  )
}
