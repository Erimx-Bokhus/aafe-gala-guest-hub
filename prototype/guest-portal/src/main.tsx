import '@shared/compat'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@shared/theme.css'
import './typography.css'
import './buttons.css'
import './hero-glass.css'
import App from './App'

createRoot(document.getElementById('root')!).render(<StrictMode><div data-app-ready style={{ display: 'contents' }}><App /></div></StrictMode>)
