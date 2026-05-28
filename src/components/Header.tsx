import React, { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { getCollections, getStoreConfig } from '../lib/queries';
import { getImageUrl, getImageSrcSet, supabase } from '../lib/supabase';
import type { Collection } from '../types';
import './Header.css';

interface HeaderLink {
  label: string;
  path: string;
}

// ── Blog añadido al final de la navegación por defecto ───────
const DEFAULT_HEADER_LINKS: HeaderLink[] = [
  { label: 'INICIO',           path: '/' },
  { label: 'CREMAS FACIALES',  path: '/coleccion/cremas-faciales' },
  { label: 'LIMPIADORES',      path: '/coleccion/limpiadores' },
  { label: 'FOTOPROTECTORES',  path: '/coleccion/fotoprotectores' },
  { label: 'GROOMING',         path: '/coleccion/grooming' },
  { label: 'CATÁLOGO',         path: '/catalogo' },
  { label: 'QUIÉNES SOMOS',    path: '/quienes-somos' },
  { label: 'BLOG',             path: '/blog' },
  { label: 'CONTACTO',         path: '/contacto' },
];

export const Header: React.FC = () => {
  const [scrolled,    setScrolled]    = useState(false);
  const [visible,     setVisible]     = useState(true);
  const [lastY,       setLastY]       = useState(0);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [logoUrl,     setLogoUrl]     = useState<string | null>(null);
  const [homeIconUrl, setHomeIconUrl] = useState<string | null>(null);
  const [headerLinks, setHeaderLinks] = useState<HeaderLink[]>(DEFAULT_HEADER_LINKS);

  const { itemCount, openCart } = useCartStore();
  const count = itemCount();

  // ── Scroll: ocultar al bajar, mostrar al subir ───────────
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      setVisible(y < lastY || y < 80);
      setLastY(y);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [lastY]);

  // ── Configuración dinámica desde Supabase ────────────────
  useEffect(() => {
    getCollections().then(setCollections);
    getStoreConfig().then(cfg => {
      setLogoUrl(cfg.logo_url || null);
      setHomeIconUrl(cfg.header_home_icon || null);
      if (cfg.header_links) {
        try {
          const links = JSON.parse(cfg.header_links);
          // Siempre garantizamos que BLOG esté en los links del admin
          if (Array.isArray(links)) {
            const hasBlog = links.some((l: HeaderLink) => l.path === '/blog');
            setHeaderLinks(hasBlog ? links : [...links, { label: 'BLOG', path: '/blog' }]);
          }
        } catch {}
      }
    });

    // Live preview desde admin
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        const payload = e.data.payload;
        if (payload.logo_url !== undefined)        setLogoUrl(payload.logo_url);
        if (payload.header_home_icon !== undefined) setHomeIconUrl(payload.header_home_icon);
        if (payload.header_links) {
          try {
            const links = JSON.parse(payload.header_links);
            if (Array.isArray(links)) {
              const hasBlog = links.some((l: HeaderLink) => l.path === '/blog');
              setHeaderLinks(hasBlog ? links : [...links, { label: 'BLOG', path: '/blog' }]);
            }
          } catch {}
        }
      }
    };
    window.addEventListener('message', handleMessage);

    // Realtime Supabase
    const channel = supabase
      .channel('header-config-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_config' },
        async () => {
          const cfg = await getStoreConfig();
          setLogoUrl(cfg.logo_url || null);
          setHomeIconUrl(cfg.header_home_icon || null);
          if (cfg.header_links) {
            try {
              const links = JSON.parse(cfg.header_links);
              if (Array.isArray(links)) {
                const hasBlog = links.some((l: HeaderLink) => l.path === '/blog');
                setHeaderLinks(hasBlog ? links : [...links, { label: 'BLOG', path: '/blog' }]);
              }
            } catch {}
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('message', handleMessage);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <header
        className={`header ${scrolled ? 'header--scrolled' : ''} ${!visible ? 'header--hidden' : ''}`}
      >
        <div className="header__inner page-width">

          {/* Hamburger — izquierda en móvil */}
          <button
            className={`header__hamburger ${mobileOpen ? 'open' : ''}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menú"
          >
            <span /><span /><span />
          </button>

          {/* Logo */}
          <Link to="/" className="header__logo" aria-label="Divina Store MX">
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
                <span className="header__logo-text">DIVINA</span>
                <span className="header__logo-accent">STORE</span>
              </>
            )}
          </Link>

          {/* Desktop Nav */}
          <nav className="header__nav" aria-label="Navegación principal">
            {headerLinks.map((link, idx) => (
              <NavLink
                key={idx}
                to={link.path}
                className={({ isActive }) => `header__nav-link ${isActive ? 'active' : ''}`}
                end={link.path === '/'}
              >
                {link.path === '/' && homeIconUrl ? (
                  <img
                    src={getImageUrl(homeIconUrl, { width: 100, quality: 90 })}
                    alt="Inicio"
                    style={{
                      height: '2.8em',
                      maxHeight: '36px',
                      width: 'auto',
                      objectFit: 'contain',
                      display: 'block',
                      filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.2))',
                    }}
                  />
                ) : (
                  link.label
                )}
              </NavLink>
            ))}
          </nav>

          {/* Actions */}
          <div className="header__actions">
            <button
              className="header__cart-btn"
              onClick={openCart}
              aria-label={`Carrito, ${count} productos`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
              {count > 0 && <span className="header__cart-count">{count}</span>}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div className={`header__mobile-menu ${mobileOpen ? 'open' : ''}`}>
          {headerLinks.map((link, idx) => (
            <NavLink
              key={idx}
              to={link.path}
              onClick={() => setMobileOpen(false)}
              end={link.path === '/'}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {link.path === '/' && homeIconUrl ? (
                <>
                  <img
                    src={getImageUrl(homeIconUrl, { width: 100, quality: 90 })}
                    alt="Inicio"
                    style={{ height: '2.5em', maxHeight: '32px', width: 'auto', objectFit: 'contain' }}
                  />
                  <span>{link.label}</span>
                </>
              ) : (
                link.label
              )}
            </NavLink>
          ))}
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="page-overlay" onClick={() => setMobileOpen(false)} />
      )}
    </>
  );
};
