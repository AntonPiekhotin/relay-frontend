import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initAuth } from '@/stores/authStore'
import { initTheme } from '@/stores/themeStore'
import { initLanguage } from '@/stores/languageStore'
import { initCallAudio } from '@/lib/calls/ringing'
import App from './App'
import './index.css'

initAuth()
initTheme()
initLanguage()
// Before any call arrives: this is also what unlocks audio on the session's first user gesture, so
// an incoming call an hour from now can still ring.
initCallAudio()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
