import React from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import type { Product } from '../types';
import './ProductCard.css';
import { analyticsItem, trackEvent } from '../lib/analytics';

interface Props {
  product: Product;
  featured?: boolean;
}

export const ProductCard: React.FC<Props> = ({ product, featured }) => {
  const addItem = useCartStore(s => s.addItem);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    trackEvent('add_to_cart', { currency: 'MXN', value: product.price, items: [analyticsItem(product)] });
  };

  const discount = product.compare_price && product.compare_price > product.price
    ? Math.round((1 - product.price / product.compare_price) * 100)
    : null;

  return (
    <Link to={`/producto/${product.slug}`} className={`product-card ${featured ? 'is-featured' : ''} ${product.in_stock ? '' : 'is-out'}`} aria-label={product.name}>
      {/* Image */}
      <div className="product-card__frame">
      <div className="product-card__media">
        {product.image_url ? (
          <img
            src={getImageUrl(product.image_url, { width: 600, quality: 80 })}
            srcSet={getImageSrcSet(product.image_url, [300, 600], { quality: 80 })}
            sizes="(max-width: 768px) 50vw, 300px"
            alt={product.name}
            loading="lazy"
          />
        ) : (
          <div className="product-card__placeholder">🌿</div>
        )}

        {/* Badges */}
        <div className="product-card__badges">
          {discount && <span className="badge badge-lime badge-discount">-{discount}%</span>}
          {!product.in_stock && <span className="badge badge-dark">Agotado</span>}
          {product.tags?.find(t => t && typeof t === 'string' && t.startsWith('BADGE:')) && (
            <span className="badge badge-lime">
              {product.tags.find(t => t && typeof t === 'string' && t.startsWith('BADGE:'))!.replace('BADGE:', '')}
            </span>
          )}
        </div>

      </div>

        {/* Agregar: en la esquina cortada, siempre visible (también en celular) */}
        <button
          type="button"
          onClick={handleAdd}
          className="product-card__add-btn"
          disabled={!product.in_stock}
          aria-label={product.in_stock ? `Agregar ${product.name} al carrito` : `${product.name} sin stock`}
          title={product.in_stock ? 'Agregar al carrito' : 'Sin stock'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {product.in_stock ? <path d="M12 5v14M5 12h14" /> : <path d="M6 6l12 12M18 6L6 18" />}
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="product-card__info">
        {product.brand && (
          <p className="product-card__brand">{product.brand}</p>
        )}
        <h3 className="product-card__name">{product.name}</h3>
        <div className="product-card__price-row">
          <div className="product-card__prices">
            <span className="product-card__price">
              ${product.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
            </span>
            {product.compare_price && product.compare_price > product.price && (
              <span className="product-card__compare">
                ${product.compare_price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>

        </div>
      </div>
    </Link>
  );
};
