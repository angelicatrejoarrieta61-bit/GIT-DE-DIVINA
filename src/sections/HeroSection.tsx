import React, { useState, useEffect } from 'react';
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

  return (
    <section 
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
          <img
            src={getImageUrl(imageUrl, { width: 1200, quality: 80 })}
            srcSet={getImageSrcSet(imageUrl, [600, 1200, 1920], { quality: 80 })}
            sizes="100vw"
            alt="Banner Hero"
            className="hero__bg-img"
            fetchPriority="high"
          />
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
