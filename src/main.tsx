import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { applyTheme, getTheme } from './utils/prefs'

// Apply the saved theme before the first paint so there's no flash of the
// default green before React mounts and syncs it via useEffect.
applyTheme(getTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)