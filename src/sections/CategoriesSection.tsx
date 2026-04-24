import React from 'react';
import { Link } from 'react-router-dom';
import type { Collection } from '../types';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import './CategoriesSection.css';

const FALLBACK_EMOJIS: Record<string, string> = {
  'cremas-serums': '🧴',
  'limpiadores-faciales': '💧',
  'fotoprotectores-solares-copia': '☀️',
  'grooming': '✂️',
};

interface Props {
  collections: Collection[];
  catConfigs?: Record<string, string>;
}

export const CategoriesSection: React.FC<Props> = ({ collections, catConfigs = {} }) => {
  const cats = collections.length > 0 ? collections.slice(0, 4) : [
    { id: '1', name: 'CREMAS FACIALES', slug: 'cremas-serums', sort_order: 0 },
    { id: '2', name: 'LIMPIADORES', slug: 'limpiadores-faciales', sort_order: 1 },
    { id: '3', name: 'FOTOPROTECCIÓN', slug: 'fotoprotectores-solares-copia', sort_order: 2 },
    { id: '4', name: 'GROOMING', slug: 'grooming', sort_order: 3 },
  ];

  return (
    <section className="categories" id="categorias" aria-label="Categorías">
      <div className="categories__grid">
        {cats.map((cat, i) => {
          const imgSrc = cat.image_url ? getImageUrl(cat.image_url, { width: 400, height: 500, quality: 80 }) : null;
          const imgSet = cat.image_url ? getImageSrcSet(cat.image_url, [300, 600], { quality: 80 }) : undefined;
          const subtitle = catConfigs[`cat_subtitle_${cat.id}`] || 'COLECCIÓN';

          return (
            <Link key={cat.id || i} to={`/coleccion/${cat.slug}`} className="category-card">
              <div className="category-card__bg">
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    srcSet={imgSet}
                    sizes="(max-width: 768px) 50vw, 300px"
                    alt={cat.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="category-card__placeholder">
                    {FALLBACK_EMOJIS[cat.slug] || '✨'}
                  </div>
                )}
              </div>

              <div className="category-card__overlay" />
              <div className="category-card__glass" />

              <div className="category-card__content">
                <div className="category-card__line" />
                <h2 className="category-card__title">{cat.name}</h2>
                <p className="category-card__count">{subtitle}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};
