import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './styles/index.css'
import App from './App.tsx'
import { hideBootLoader } from './lib/storeBoot'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
)

// El admin no usa el tema de la tienda: quita el loader de inmediato.
if (window.location.pathname.startsWith('/admin')) hideBootLoader()
