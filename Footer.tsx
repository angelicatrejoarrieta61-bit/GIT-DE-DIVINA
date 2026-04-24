import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStoreConfig } from '../lib/queries';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import './Footer.css';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    getStoreConfig().then(cfg => setLogoUrl(cfg.logo_url));
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) { setSubscribed(true); setEmail(''); }
  };

  return (
    <footer className="footer" id="footer" role="contentinfo">
      <div className="footer__inner page-width">

        {/* Top row */}
        <div className="footer__top">
          {/* Brand */}
          <div className="footer__brand">
            <div className="footer__logo">
              {logoUrl ? (
                <img 
                  src={getImageUrl(logoUrl, { width: 180, quality: 90 })} 
                  srcSet={getImageSrcSet(logoUrl, [180, 360], { quality: 90 })}
                  sizes="180px"
                  alt="Divina Store" 
                  style={{ height: 'var(--logo-h)', maxHeight: 100, width: 'auto', objectFit: 'contain' }} 
                />
              ) : (
                <>
                  <span className="footer__logo-text">DIVINA</span>
                  <span className="footer__logo-accent">STORE MX</span>
                </>
              )}
            </div>
            <p className="footer__tagline muted-text">
              La belleza que nace del alma y perdura para siempre.
            </p>
            {/* Newsletter */}
            <div className="footer__newsletter">
              <h3 className="footer__newsletter-title">Suscribirte ahora</h3>
              <p className="footer__newsletter-sub muted-text">
                Suscríbete para recibir ofertas exclusivas, descuentos y mucho más
              </p>
              {subscribed ? (
                <p className="footer__newsletter-success">✅ ¡Gracias por suscribirte!</p>
              ) : (
                <form onSubmit={handleSubscribe} className="footer__newsletter-form">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="footer__newsletter-input"
                    required
                    aria-label="Correo electrónico"
                  />
                  <button type="submit" className="footer__newsletter-btn">→</button>
                </form>
              )}
            </div>
          </div>

          {/* Nav columns */}
          <nav className="footer__nav" aria-label="Navegación del footer">
            <div className="footer__col">
              <h4 className="footer__col-title">Nuestras secciones</h4>
              <ul>
                <li><Link to="/">Inicio</Link></li>
                <li><Link to="/catalogo">Productos</Link></li>
                <li><Link to="/quienes-somos">Sobre Nosotros</Link></li>
                <li><Link to="/contacto">Contacto</Link></li>
              </ul>
            </div>
            <div className="footer__col">
              <h4 className="footer__col-title">Categorías</h4>
              <ul>
                <li><Link to="/coleccion/cremas-serums">Cremas Faciales</Link></li>
                <li><Link to="/coleccion/limpiadores-faciales">Limpiadores</Link></li>
                <li><Link to="/coleccion/fotoprotectores-solares-copia">Fotoprotectores</Link></li>
                <li><Link to="/coleccion/grooming">Grooming</Link></li>
              </ul>
            </div>
            <div className="footer__col">
              <h4 className="footer__col-title">Otras secciones</h4>
              <ul>
                <li><a href="#" onClick={e => e.preventDefault()}>Política de Privacidad</a></li>
                <li><a href="#" onClick={e => e.preventDefault()}>Política de Reembolso</a></li>
                <li><a href="#" onClick={e => e.preventDefault()}>Términos y Condiciones</a></li>
                <li><Link to="/contacto">Contacto</Link></li>
              </ul>
            </div>
          </nav>
        </div>

        {/* Divider */}
        <div className="footer__sep" />

        {/* Bottom bar */}
        <div className="footer__bottom">
          <p className="footer__copy muted-text">
            Divina store®, todos los Derechos reservados 2026 ®
          </p>
          <div className="footer__social">
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="footer__social-link">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
              </svg>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="footer__social-link">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            </a>
          </div>
          {/* Scroll to top */}
          <button
            className="footer__top-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Volver arriba"
          >
            ↑
          </button>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="footer__accent-line" />
    </footer>
  );
};
