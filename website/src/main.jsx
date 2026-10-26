import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import '@fontsource-variable/inter'
import '@fontsource-variable/archivo'
import '@fontsource-variable/jetbrains-mono'
import './styles/index.css'

import App from './App.jsx'
import { applyAccent, ACCENT_STORAGE_KEY } from './lib/accents.js'

// Restore the visitor's chosen accent before first paint.
applyAccent(window.localStorage.getItem(ACCENT_STORAGE_KEY))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
