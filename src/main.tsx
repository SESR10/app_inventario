import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans/index.css'
import './i18n'
import './index.css'
import App from './App.tsx'
import { supabase } from './lib/supabase'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App client={supabase} />
  </StrictMode>,
)
