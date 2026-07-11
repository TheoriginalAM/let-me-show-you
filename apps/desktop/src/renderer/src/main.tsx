import React from 'react'
import ReactDOM from 'react-dom/client'
import { ControlPanel } from './control/ControlPanel'
import { WebcamBubble } from './webcam/WebcamBubble'
import './assets/index.css'

// A single renderer bundle serves two windows, selected by URL hash:
//   (no hash)  -> the control panel
//   #webcam    -> the circular webcam bubble
const view = window.location.hash.replace(/^#/, '') || 'control'
document.documentElement.dataset.view = view

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{view === 'webcam' ? <WebcamBubble /> : <ControlPanel />}</React.StrictMode>,
)
