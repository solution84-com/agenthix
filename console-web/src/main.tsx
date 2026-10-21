import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled with the app: the Fleet Console makes no request off its machine.
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
