import React, { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { getCollections, getStoreConfig } from '../lib/queries';
import { getImageUrl, getImageSrcSet, supabase } from '../lib/supabase';
import type { Collection } from '../types';
import './Header.css';

export const Header: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [lastY, setLastY] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { itemCount, openCart } = useCartStore();
  const count = itemCount();

  // Admin shortcut (F7)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F7') window.location.href = '/admin';
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Scroll behavior
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

  useEffect(() => {
    getCollections().then(setCollections);
    getStoreConfig().then(cfg => setLogoUrl(cfg.logo_url));

    const channel = supabase
      .channel('header-config-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_config', filter: 'key=eq.logo_url' },
        async () => {
          const cfg = await getStoreConfig();
          setLogoUrl(cfg.logo_url || null);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <header className={`header ${scrolled ? 'header--scrolled' : ''} ${!visible ? 'header--hidden' : ''}`}>
        <div className="header__inner page-width">
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
            <NavLink to="/" className={({ isActive }) => `header__nav-link ${isActive ? 'active' : ''}`} end>
              Inicio
            </NavLink>
            {collections.map(col => (
              <NavLink
                key={col.id}
                to={`/coleccion/${col.slug}`}
                className={({ isActive }) => `header__nav-link ${isActive ? 'active' : ''}`}
              >
                {col.name}
              </NavLink>
            ))}
            <NavLink to="/catalogo" className={({ isActive }) => `header__nav-link ${isActive ? 'active' : ''}`}>
              Catálogo
            </NavLink>
            <NavLink to="/quienes-somos" className={({ isActive }) => `header__nav-link ${isActive ? 'active' : ''}`}>
              Quiénes Somos
            </NavLink>
            <NavLink to="/contacto" className={({ isActive }) => `header__nav-link ${isActive ? 'active' : ''}`}>
              Contacto
            </NavLink>
          </nav>

          {/* Actions */}
          <div className="header__actions">
            <button
              className="header__cart-btn"
              onClick={openCart}
              aria-label={`Carrito, ${count} productos`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {count > 0 && <span className="header__cart-count">{count}</span>}
            </button>

            {/* Hamburger */}
            <button
              className={`header__hamburger ${mobileOpen ? 'open' : ''}`}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menú"
            >
              <span /><span /><span />
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div className={`header__mobile-menu ${mobileOpen ? 'open' : ''}`}>
          <NavLink to="/" onClick={() => setMobileOpen(false)}>Inicio</NavLink>
          {collections.map(col => (
            <NavLink key={col.id} to={`/coleccion/${col.slug}`} onClick={() => setMobileOpen(false)}>
              {col.name}
            </NavLink>
          ))}
          <NavLink to="/catalogo" onClick={() => setMobileOpen(false)}>Catálogo</NavLink>
          <NavLink to="/quienes-somos" onClick={() => setMobileOpen(false)}>Quiénes Somos</NavLink>
          <NavLink to="/contacto" onClick={() => setMobileOpen(false)}>Contacto</NavLink>
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="page-overlay" onClick={() => setMobileOpen(false)} />
      )}
    </>
  );
};
