import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initAuth } from '@/stores/authStore'
import App from './App'
import './index.css'

initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
