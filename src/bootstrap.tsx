import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/manrope'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </BrowserRouter>
  </StrictMode>,
)
