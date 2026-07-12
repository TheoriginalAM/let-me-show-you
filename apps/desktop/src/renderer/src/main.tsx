import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import { ControlPanel } from './control/ControlPanel'
import { WebcamBubble } from './webcam/WebcamBubble'
import { AreaOverlay } from './area/AreaOverlay'
import { RecordingIndicator } from './indicator/RecordingIndicator'
import './assets/index.css'

// Renderer crash reporting. Events forward to the main-process Sentry client,
// which is itself gated on SENTRY_DSN — so this is a no-op unless configured.
// Only wired in production builds (off in dev).
if (import.meta.env.PROD) Sentry.init({})

// A single renderer bundle serves several windows, selected by URL hash:
//   (no hash)  -> the control panel
//   #webcam    -> the circular webcam bubble
//   #area      -> the fullscreen drag-to-select region overlay
const view = window.location.hash.replace(/^#/, '') || 'control'
document.documentElement.dataset.view = view

function Root() {
  if (view === 'webcam') return <WebcamBubble />
  if (view === 'area') return <AreaOverlay />
  if (view === 'indicator') return <RecordingIndicator />
  return <ControlPanel />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
