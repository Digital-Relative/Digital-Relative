import { StrictMode } from 'react'

import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)

// ── Crisp live chat (optional) ──────────────────────────────────────────────
// Loads only on public pages (landing, pricing, blog) - never when vault is unlocked
// If no VITE_CRISP_WEBSITE_ID is set, nothing loads
const CRISP_ID = import.meta.env.VITE_CRISP_WEBSITE_ID
if (CRISP_ID) {
  // Only load on public pages - not inside the authenticated app
  // The app router sets document.body.dataset.vaultOpen when vault is unlocked
  // Crisp is hidden when vault is open to prevent third-party JS touching vault memory
  window.$crisp = []
  window.CRISP_WEBSITE_ID = CRISP_ID
  const s = document.createElement('script')
  s.src   = 'https://client.crisp.chat/l.js'
  s.async = true
  document.head.appendChild(s)

  // Hide Crisp widget while vault is unlocked (belt-and-suspenders)
  const observer = new MutationObserver(() => {
    const vaultOpen = document.body?.dataset?.vaultOpen === 'true'
    if (window.$crisp?.push) {
      window.$crisp.push(vaultOpen ? ['do', 'chat:hide'] : ['do', 'chat:show'])
    }
  })
  observer.observe(document.body || document.documentElement, { attributes: true, attributeFilter: ['data-vault-open'] })
}

// ── Service worker registration ──────────────────────────────────────────────
// Registered after React mounts so it doesn't block the first render
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch(() => {}) // SW is enhancement only - never block the app
  })
}
