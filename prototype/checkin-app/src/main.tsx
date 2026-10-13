import '@shared/compat'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@shared/theme.css'
import './checkin.css'
import App from './App'

createRoot(document.getElementById('root')!).render(<StrictMode><div data-app-ready style={{ display: 'contents' }}><App /></div></StrictMode>)

// Offline helper (shared/public/checkin-sw.js): keeps a copy of the app on the iPad so it opens without Wi-Fi.
// Only in the built app on https or this computer; never in development or the double-click demo file.
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./checkin-sw.js').catch(() => { /* the app works without it */ }) })
}
