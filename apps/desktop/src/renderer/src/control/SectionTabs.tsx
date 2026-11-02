export type Section = 'record' | 'meetings' | 'calendar'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'record', label: 'Record' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'calendar', label: 'Calendar' },
]

/** The app's three areas; the active one gets its highlighter swipe. */
export function SectionTabs({
  value,
  onChange,
  callsToday,
}: {
  value: Section
  onChange: (section: Section) => void
  /** Calls the user hosts today, shown on the Calendar tab. */
  callsToday: number
}) {
  return (
    <nav className="section-tabs no-drag" aria-label="Sections">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`section-tab ${value === s.id ? 'on' : ''}`}
          data-section={s.id}
          aria-current={value === s.id ? 'page' : undefined}
          onClick={() => onChange(s.id)}
        >
          <span className="section-tab-label">{s.label}</span>
          {s.id === 'calendar' && callsToday > 0 && (
            <span className="section-tab-badge" aria-label={`${callsToday} today`}>
              {callsToday}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
