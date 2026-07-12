import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { installFocusGuard } from './utils/focusGuard'

// ── GLOBAL FOCUS FIX ──
// Must run before React mounts. Fixes "input fields stop responding until I
// click the taskbar" across EVERY page and every input — no per-page changes.
installFocusGuard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)