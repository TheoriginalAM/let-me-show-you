import { useRecorderStore } from '../store'

/** Area mode: launch the drag-to-select overlay and remember the chosen region. */
export function AreaPicker() {
  const areaRect = useRecorderStore((s) => s.areaRect)
  const setAreaRect = useRecorderStore((s) => s.setAreaRect)

  async function pick(): Promise<void> {
    const rect = await window.recorder.selectArea().catch(() => null)
    if (rect) setAreaRect(rect)
  }

  return (
    <div className="area-pick">
      <button className="btn-secondary no-drag" onClick={() => void pick()}>
        {areaRect ? 'Reselect area' : 'Select area to record'}
      </button>
      <p className="area-hint">
        {areaRect
          ? `${areaRect.width} × ${areaRect.height} region ready`
          : 'Drag a box on your screen to record just that region.'}
      </p>
    </div>
  )
}
