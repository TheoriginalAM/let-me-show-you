import type { CaptureSource } from '@shared/ipc'
import { useRecorderStore } from '../store'

function SourceCard({
  source,
  selected,
  onSelect,
}: {
  source: CaptureSource
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      className={`source-card no-drag ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(source.id)}
      title={source.name}
    >
      <img className="source-thumb" src={source.thumbnailDataUrl} alt="" draggable={false} />
      <span className="source-name">
        {source.appIconDataUrl && (
          <img className="source-icon" src={source.appIconDataUrl} alt="" />
        )}
        <span className="source-name-text">{source.name}</span>
      </span>
    </button>
  )
}

/** Grid of capturable sources for the current mode ('screen' or 'window'). */
export function SourcePicker({ mode }: { mode: 'screen' | 'window' }) {
  const sources = useRecorderStore((s) => s.sources)
  const loading = useRecorderStore((s) => s.loadingSources)
  const selectedSourceId = useRecorderStore((s) => s.selectedSourceId)
  const selectSource = useRecorderStore((s) => s.selectSource)

  const items = sources.filter((s) => s.type === mode)

  if (loading && items.length === 0) {
    return <div className="picker-empty">Loading {mode === 'screen' ? 'screens' : 'windows'}…</div>
  }
  if (items.length === 0) {
    return <div className="picker-empty">No {mode === 'screen' ? 'screens' : 'windows'} found.</div>
  }

  return (
    <div className="source-grid">
      {items.map((source) => (
        <SourceCard
          key={source.id}
          source={source}
          selected={source.id === selectedSourceId}
          onSelect={selectSource}
        />
      ))}
    </div>
  )
}
