import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initAuth } from '@/stores/authStore'
import { initTheme } from '@/stores/themeStore'
import App from './App'
import './index.css'

initAuth()
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
