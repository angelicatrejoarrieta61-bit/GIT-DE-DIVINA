import React from 'react';
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
  return (
    <section className="hero" id="hero" aria-label="Hero principal">
      {/* Background */}
      <div className="hero__media">
        {imageUrl ? (
          <>
            <img
              src={getImageUrl(imageUrl, { width: 1200, quality: 80 })}
              srcSet={getImageSrcSet(imageUrl, [600, 1200, 1920], { quality: 80 })}
              sizes="100vw"
              alt="Banner Hero Backdrop"
              className="hero__media-backdrop"
              aria-hidden="true"
            />
            <img
              src={getImageUrl(imageUrl, { width: 1200, quality: 80 })}
              srcSet={getImageSrcSet(imageUrl, [600, 1200, 1920], { quality: 80 })}
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
      <div className="hero__container page-width" style={{ display: 'var(--hero-card-display, flex)' }}>
        <div className="hero__content glass">
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
