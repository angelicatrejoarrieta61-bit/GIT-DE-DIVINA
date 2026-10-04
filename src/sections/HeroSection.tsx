import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import './HeroSection.css';

interface Props {
  imageUrl?: string;
  title?: string;
  subtitle?: string;
  btn1?: string;
  btn2?: string;
}

export const HeroSection: React.FC<Props> = ({
  imageUrl,
  title = 'NOVEDADES DIVINA',
  subtitle = 'Descubre la nueva generación de tratamientos cremas, Sérums, fotoprotectores y vitamínicos, así como agua micelar y otros que ayudarán a la mejora de tu piel.',
  btn1 = 'Explorar Catálogo',
  btn2 = 'Ver Cremas & Sérums',
}) => {
  const [leftColor, setLeftColor] = useState('rgba(6,6,6,1)');
  const [rightColor, setRightColor] = useState('rgba(6,6,6,1)');

  useEffect(() => {
    if (!imageUrl) return;
    const imgUrl = getImageUrl(imageUrl, { width: 400, quality: 60 });
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imgUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const leftPixel = ctx.getImageData(0, Math.floor(img.height / 2), 1, 1).data;
          const rightPixel = ctx.getImageData(img.width - 1, Math.floor(img.height / 2), 1, 1).data;
          setLeftColor(`rgb(${leftPixel[0]}, ${leftPixel[1]}, ${leftPixel[2]})`);
          setRightColor(`rgb(${rightPixel[0]}, ${rightPixel[1]}, ${rightPixel[2]})`);
        }
      } catch (e) {
        console.warn('Canvas color extraction failed:', e);
      }
    };
  }, [imageUrl]);

  // ── La tarjeta de cristal nunca se sale de la imagen ─────────────
  // Los ajustes X/Y/escala del admin se respetan, pero si en esta pantalla
  // la tarjeta quedaría fuera del hero, se corrige con --hero-fix-x / --hero-fix-y.
  const heroRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const card = cardRef.current;
    if (!hero || !card) return;
    let frame = 0;

    const clamp = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.matchMedia('(max-width: 768px)').matches) {
          hero.style.setProperty('--hero-fix-x', '0px');
          hero.style.setProperty('--hero-fix-y', '0px');
          return;
        }
        const cs = getComputedStyle(hero);
        const curX = parseFloat(cs.getPropertyValue('--hero-fix-x')) || 0;
        const curY = parseFloat(cs.getPropertyValue('--hero-fix-y')) || 0;
        const h = hero.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 62;
        const margin = 16;
        // Posición sin corrección
        const left = c.left - curX, right = c.right - curX, top = c.top - curY, bottom = c.bottom - curY;
        const minL = h.left + margin, maxR = h.right - margin;
        const minT = h.top + navH + margin, maxB = h.bottom - margin;
        let dx = 0, dy = 0;
        if (left < minL) dx = minL - left; else if (right > maxR) dx = maxR - right;
        if (top < minT) dy = minT - top; else if (bottom > maxB) dy = maxB - bottom;
        hero.style.setProperty('--hero-fix-x', `${Math.round(dx)}px`);
        hero.style.setProperty('--hero-fix-y', `${Math.round(dy)}px`);
      });
    };

    clamp();
    card.addEventListener('animationend', clamp);
    window.addEventListener('resize', clamp);
    // Cambios de posición/escala desde el admin (variables en <html>)
    const mo = new MutationObserver(clamp);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    const ro = new ResizeObserver(clamp);
    ro.observe(card);
    return () => {
      cancelAnimationFrame(frame);
      card.removeEventListener('animationend', clamp);
      window.removeEventListener('resize', clamp);
      mo.disconnect();
      ro.disconnect();
    };
  }, [title, subtitle, btn1, btn2]);

  return (
    <section 
      ref={heroRef}
      className="hero" 
      id="hero" 
      aria-label="Hero principal"
      style={{
        background: `linear-gradient(to right, ${leftColor} 0%, ${leftColor} 25%, ${rightColor} 75%, ${rightColor} 100%)`
      }}
    >
      {/* Background */}
      <div className="hero__media">
        {imageUrl ? (
          <>
          {/* Relleno: la misma foto difuminada cubre siempre de orilla a orilla */}
          <img
            src={getImageUrl(imageUrl, { width: 400, quality: 60 })}
            alt=""
            aria-hidden="true"
            className="hero__bg-fill"
          />
          <img
            src={getImageUrl(imageUrl, { width: 1200, quality: 80 })}
            srcSet={getImageSrcSet(imageUrl, [480, 768, 1200, 1920, 2560], { quality: 80 })}
            sizes="100vw"
            alt="Banner Hero"
            className="hero__bg-img"
            fetchPriority="high"
          />
          </>
        ) : (
          <div className="hero__media-placeholder" />
        )}
      </div>

      <div className="hero__overlay" />
      <div className="hero__glow" />

      <div className="hero__scroll-hint" aria-hidden="true">
        <div className="hero__scroll-line" />
        <span>SCROLL EXPERIENCE</span>
      </div>

      {/* Content */}
      <div className="hero__container page-width">
        <div ref={cardRef} className="hero__content glass">
          <div className="hero__label">
            <span className="hero__label-line" />
            NUEVA COLECCIÓN 2026
          </div>

          <h1 className="hero__heading">
            {title.includes(' ') ? (
              <>
                {title.split(' ').slice(0, -1).join(' ')}{' '}
                <span className="hero__heading-accent">{title.split(' ').slice(-1)[0]}</span>
              </>
            ) : (
              <span className="hero__heading-accent">{title}</span>
            )}
          </h1>

          <p className="hero__text">{subtitle}</p>

          <div className="hero__ctas">
            <Link to="/catalogo" className="btn btn-primary">{btn1}</Link>
            <Link to="/coleccion/cremas-serums" className="btn btn-outline">{btn2}</Link>
          </div>
        </div>
      </div>
    </section>
  );
};
