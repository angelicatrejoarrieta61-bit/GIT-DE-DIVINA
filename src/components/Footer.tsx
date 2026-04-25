import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStoreConfig } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import { LegalModal } from './LegalModal';
import { ContactModal } from './ContactModal';
import './Footer.css';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  
  // Settings extracted from the Admin configuration
  const [configs, setConfigs] = useState<Record<string, string>>({
    footer_tagline: 'La belleza que nace del alma y perdura para siempre.',
    footer_nl_title: 'Suscríbete ahora',
    footer_nl_subtitle: 'Recibe ofertas exclusivas, descuentos y mucho más',
    logo_url: '',
    footer_facebook_url: '',
    footer_twitter_url: '',
    footer_x_url: '',
    
    // Columns
    footer_col1_title: 'Nuestras Secciones',
    footer_col1_l1: 'Catálogo general : /catalogo',
    footer_col1_l2: '¿Quiénes somos? : /quienes-somos',
    footer_col1_l3: 'Contáctanos : /contacto',
    
    footer_col2_title: 'Categorías',
    footer_col2_l1: 'Cremas Faciales : /coleccion/cremas-faciales',
    footer_col2_l2: 'Limpiadores : /coleccion/limpiadores',
    footer_col2_l3: 'Fotoprotectores : /coleccion/fotoprotectores',
    footer_col2_l4: 'Grooming : /coleccion/grooming',
    
    footer_col3_title: 'Otras Secciones',
    footer_col3_l1: 'Programa de promoción : /pages/programa-de-promocion',
    footer_col3_l2: 'Programa testers : /pages/programa-testers',
    footer_col3_l3: 'Legales y Copyright : /pages/legales',
  });

  const applyConfig = (cfg: Record<string, string>) => {
    setConfigs(prev => ({ ...prev, ...cfg }));
  };

  useEffect(() => {
    getStoreConfig().then(applyConfig);

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        applyConfig(e.data.payload);
      }
    };
    window.addEventListener('message', handleMessage);
    
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) { setSubscribed(true); setEmail(''); }
  };

  const parseLink = (val: string) => {
    if (!val) return { label: '', url: '' };
    const parts = val.split(':');
    return {
      label: parts[0]?.trim() || '',
      url: parts.slice(1).join(':').trim() || '/'
    };
  };

  const c11 = parseLink(configs.footer_col1_l1);
  const c12 = parseLink(configs.footer_col1_l2);
  const c13 = parseLink(configs.footer_col1_l3);

  const c21 = parseLink(configs.footer_col2_l1);
  const c22 = parseLink(configs.footer_col2_l2);
  const c23 = parseLink(configs.footer_col2_l3);
  const c24 = parseLink(configs.footer_col2_l4);

  const c31 = parseLink(configs.footer_col3_l1);
  const c32 = parseLink(configs.footer_col3_l2);
  const c33 = parseLink(configs.footer_col3_l3);

  return (
    <footer className="divina-footer" role="contentinfo" aria-label="Pie de página Divina Store">
      <div className="divina-footer__fade" aria-hidden="true"></div>

      <div className="divina-footer__bg" aria-hidden="true">
        <svg className="divina-footer__wave" viewBox="0 0 1440 320" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,160 C180,240 360,80 540,160 C720,240 900,80 1080,160 C1260,240 1380,120 1440,160 L1440,320 L0,320 Z" fill="none" stroke="rgba(196, 252, 21, 0.12)" strokeWidth="1.5"/>
          <path d="M0,200 C200,120 400,280 600,200 C800,120 1000,280 1200,200 C1320,160 1400,220 1440,200 L1440,320 L0,320 Z" fill="none" stroke="rgba(196, 252, 21, 0.07)" strokeWidth="1"/>
        </svg>
        <div className="divina-footer__glow divina-footer__glow--tr" aria-hidden="true"></div>
        <div className="divina-footer__glow divina-footer__glow--bl" aria-hidden="true"></div>
      </div>

      <div className="divina-footer__inner">

        {/* ── Columna 1: Logo + tagline + newsletter ── */}
        <div className="divina-footer__brand">
          <Link to="/" className="divina-footer__logo" aria-label="Inicio Divina Store">
            {configs.logo_url ? (
              <img
                src={getImageUrl(configs.logo_url, { width: 400, quality: 90 })}
                alt="Divina Store"
                style={{ width: 'auto', height: 75, objectFit: 'contain' }}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="divina-footer__logo-text">DIVIИ⋀</span>
            )}
          </Link>

          <p className="divina-footer__tagline">{configs.footer_tagline}</p>

          <div className="divina-footer__newsletter">
            <p className="divina-footer__nl-title">{configs.footer_nl_title}</p>
            <p className="divina-footer__nl-sub">{configs.footer_nl_subtitle}</p>
            
            {subscribed ? (
              <p style={{ color: 'var(--c-lime)', fontSize: '0.85rem' }}>✅ ¡Gracias por suscribirte!</p>
            ) : (
              <form onSubmit={handleSubscribe} className="divina-footer__nl-form" aria-label="Formulario de suscripción">
                <div className="divina-footer__nl-row">
                  <label htmlFor="footer-email-input" className="visually-hidden">Tu correo electrónico</label>
                  <input
                    type="email"
                    id="footer-email-input"
                    className="divina-footer__nl-input"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    aria-required="true"
                  />
                  <button type="submit" className="divina-footer__nl-btn" aria-label="Suscribirse">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* ── Columna 2: Nuestras Secciones ── */}
        <nav className="divina-footer__nav" aria-label={configs.footer_col1_title}>
          <h3 className="divina-footer__nav-title">{configs.footer_col1_title}</h3>
          <ul className="divina-footer__nav-list" role="list">
            {c11.label && (
              <li>
                <Link to={c11.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  {c11.label}
                </Link>
              </li>
            )}
            {c12.label && (
              <li>
                <Link to={c12.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  {c12.label}
                </Link>
              </li>
            )}
            {c13.label && (
              <li>
                <Link to={c13.url} className="divina-footer__nav-link" onClick={(e) => {
                  const label = c13.label.toLowerCase();
                  if (c13.url.includes('contacto') || label.includes('contact') || label.includes('contáct')) {
                    e.preventDefault();
                    setShowContactModal(true);
                  }
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-5-5A19.79 19.79 0 0 1 4.09 4.18 2 2 0 0 1 6.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L10.09 9.91a16 16 0 0 0 5 5l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  {c13.label}
                </Link>
              </li>
            )}
          </ul>
        </nav>

        {/* ── Columna 3: Categorías ── */}
        <nav className="divina-footer__nav" aria-label={configs.footer_col2_title}>
          <h3 className="divina-footer__nav-title">{configs.footer_col2_title}</h3>
          <ul className="divina-footer__nav-list" role="list">
            {c21.label && (
              <li>
                <Link to={c21.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  {c21.label}
                </Link>
              </li>
            )}
            {c22.label && (
              <li>
                <Link to={c22.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                  {c22.label}
                </Link>
              </li>
            )}
            {c23.label && (
              <li>
                <Link to={c23.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                  {c23.label}
                </Link>
              </li>
            )}
            {c24?.label && (
              <li>
                <Link to={c24.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 13.5V3.75m0 9.75a1.5 1.5 0 0 1 3 0m-3 0a1.5 1.5 0 0 0-3 0m3 0V21m12-7.5V3.75m0 9.75a1.5 1.5 0 0 1 3 0m-3 0a1.5 1.5 0 0 0-3 0m3 0V21M12 18V3.75m0 14.25a1.5 1.5 0 0 1 3 0m-3 0a1.5 1.5 0 0 0-3 0m3 0v3"/></svg>
                  {c24.label}
                </Link>
              </li>
            )}
          </ul>
        </nav>

        {/* ── Columna 4: Otras Secciones ── */}
        <nav className="divina-footer__nav" aria-label={configs.footer_col3_title}>
          <h3 className="divina-footer__nav-title">{configs.footer_col3_title}</h3>
          <ul className="divina-footer__nav-list" role="list">
            {c31.label && (
              <li>
                <Link to={c31.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                  {c31.label}
                </Link>
              </li>
            )}
            {c32.label && (
              <li>
                <Link to={c32.url} className="divina-footer__nav-link">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  {c32.label}
                </Link>
              </li>
            )}
            {c33.label && (
              <li>
                <Link to={c33.url} className="divina-footer__nav-link" onClick={(e) => {
                  if (c33.url.includes('legales') || c33.label.toLowerCase().includes('legal')) {
                    e.preventDefault();
                    setShowLegalModal(true);
                  }
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  {c33.label}
                </Link>
              </li>
            )}
          </ul>
        </nav>

      </div>

      {/* ── Línea divisoria ── */}
      <div className="divina-footer__divider" aria-hidden="true"></div>

      {/* ── Bottom bar ── */}
      <div className="divina-footer__bottom">
        <p className="divina-footer__copy">
          <em>Divina store®, todos los Derechos reservados {new Date().getFullYear()} ©</em>
        </p>

        <div className="divina-footer__socials" role="list" aria-label="Redes sociales">
          {configs.footer_facebook_url && (
            <a href={configs.footer_facebook_url} target="_blank" rel="noopener noreferrer" className="divina-footer__social-btn" aria-label="Facebook" role="listitem">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
          )}
          {configs.footer_twitter_url && (
            <a href={configs.footer_twitter_url} target="_blank" rel="noopener noreferrer" className="divina-footer__social-btn" aria-label="Twitter" role="listitem">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53A4.48 4.48 0 0 0 22.43 1s-2 .91-3.18 1.16A4.46 4.46 0 0 0 11.85 6a12.65 12.65 0 0 1-9.19-4.66s-4 9.08 5 13a10.94 10.94 0 0 1-6.59 1.88c9.04 5.38 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
            </a>
          )}
          {configs.footer_x_url && (
            <a href={configs.footer_x_url} target="_blank" rel="noopener noreferrer" className="divina-footer__social-btn" aria-label="X" role="listitem">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.902-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link
            to="/admin"
            className="divina-footer__totop"
            style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Panel de Administración"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </Link>

          <button
            className="divina-footer__totop"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Volver al inicio de la página"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>
      </div>

      <LegalModal isOpen={showLegalModal} onClose={() => setShowLegalModal(false)} />
      <ContactModal isOpen={showContactModal} onClose={() => setShowContactModal(false)} />
    </footer>
  );
};
