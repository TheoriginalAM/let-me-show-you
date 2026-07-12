import type { ReactNode } from 'react'
import type { RecordingMode } from '@shared/ipc'
import { useRecorderStore } from '../store'

const svg = (path: ReactNode): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {path}
  </svg>
)

const TABS: { mode: RecordingMode; label: string; icon: ReactNode }[] = [
  {
    mode: 'screen',
    label: 'Screen',
    icon: svg(
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>,
    ),
  },
  {
    mode: 'window',
    label: 'Window',
    icon: svg(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
      </>,
    ),
  },
  {
    mode: 'area',
    label: 'Area',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeDasharray="3.5 3"
      >
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      </svg>
    ),
  },
  {
    mode: 'camera',
    label: 'Camera',
    icon: svg(
      <>
        <path d="M23 7l-7 5 7 5V7Z" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </>,
    ),
  },
]

export function ModeTabs() {
  const mode = useRecorderStore((s) => s.mode)
  const setMode = useRecorderStore((s) => s.setMode)

  return (
    <div className="mode-tabs no-drag">
      {TABS.map((t) => (
        <button
          key={t.mode}
          className={`mode-tab ${mode === t.mode ? 'on' : ''}`}
          onClick={() => setMode(t.mode)}
        >
          <span className="mode-tab-ico">{t.icon}</span>
          <span className="mode-tab-label">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
