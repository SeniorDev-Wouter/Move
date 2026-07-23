import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {})
  })
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.active?.postMessage({ type: 'client-ready' })
    })
    .catch(() => {})
}
