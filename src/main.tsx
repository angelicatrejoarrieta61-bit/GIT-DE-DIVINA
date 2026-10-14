import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './styles/index.css'
import App from './App.tsx'
import { hideBootLoader } from './lib/storeBoot'

/**
 * El HTML que entrega el servidor trae metadatos prerenderizados (title, description,
 * canonical, og:*, JSON-LD) entre los comentarios SEO_PRERENDER_*. Son para los bots que
 * no ejecutan JavaScript. En cuanto arranca la app, react-helmet-async escribe los mismos
 * datos (mismas reglas, src/lib/seoRules.js), así que se retiran los estáticos para que
 * nunca haya dos canonical ni dos Product schema en la página. El <title> se conserva:
 * Helmet sólo cambia su texto.
 */
function dropPrerenderedSeo() {
  const head = document.head;
  let inside = false;
  for (const node of Array.from(head.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const text = node.nodeValue || '';
      if (text.includes('SEO_PRERENDER_START')) { inside = true; continue; }
      if (text.includes('SEO_PRERENDER_END')) break;
    }
    if (inside && node.nodeName !== 'TITLE') head.removeChild(node);
  }
}
dropPrerenderedSeo();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
)

// El admin no usa el tema de la tienda: quita el loader de inmediato.
if (window.location.pathname.startsWith('/admin')) hideBootLoader()
