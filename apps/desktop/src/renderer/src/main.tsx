import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/electron/renderer'
import { ControlPanel } from './control/ControlPanel'
import { WebcamBubble } from './webcam/WebcamBubble'
import './assets/index.css'

// Renderer crash reporting. Events forward to the main-process Sentry client,
// which is itself gated on SENTRY_DSN — so this is a no-op unless configured.
// Only wired in production builds (off in dev).
if (import.meta.env.PROD) Sentry.init({})

// A single renderer bundle serves two windows, selected by URL hash:
//   (no hash)  -> the control panel
//   #webcam    -> the circular webcam bubble
const view = window.location.hash.replace(/^#/, '') || 'control'
document.documentElement.dataset.view = view

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{view === 'webcam' ? <WebcamBubble /> : <ControlPanel />}</React.StrictMode>,
)
