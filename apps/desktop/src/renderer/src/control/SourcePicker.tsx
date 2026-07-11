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

function SourceGroup({
  title,
  items,
  selectedSourceId,
  onSelect,
}: {
  title: string
  items: CaptureSource[]
  selectedSourceId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="source-group">
      <h3 className="group-title">{title}</h3>
      <div className="source-grid">
        {items.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            selected={source.id === selectedSourceId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

export function SourcePicker() {
  const sources = useRecorderStore((s) => s.sources)
  const loading = useRecorderStore((s) => s.loadingSources)
  const selectedSourceId = useRecorderStore((s) => s.selectedSourceId)
  const selectSource = useRecorderStore((s) => s.selectSource)

  if (loading && sources.length === 0) {
    return <div className="picker-empty">Loading sources…</div>
  }
  if (sources.length === 0) {
    return <div className="picker-empty">No capturable sources found.</div>
  }

  const screens = sources.filter((s) => s.type === 'screen')
  const windows = sources.filter((s) => s.type === 'window')

  return (
    <div className="sources">
      {screens.length > 0 && (
        <SourceGroup
          title="Screens"
          items={screens}
          selectedSourceId={selectedSourceId}
          onSelect={selectSource}
        />
      )}
      {windows.length > 0 && (
        <SourceGroup
          title="Windows"
          items={windows}
          selectedSourceId={selectedSourceId}
          onSelect={selectSource}
        />
      )}
    </div>
  )
}
