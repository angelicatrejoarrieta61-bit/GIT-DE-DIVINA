import React from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import type { Product } from '../types';
import './ProductCard.css';

interface Props {
  product: Product;
}

export const ProductCard: React.FC<Props> = ({ product }) => {
  const addItem = useCartStore(s => s.addItem);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
  };

  const discount = product.compare_price && product.compare_price > product.price
    ? Math.round((1 - product.price / product.compare_price) * 100)
    : null;

  return (
    <Link to={`/producto/${product.slug}`} className="product-card" aria-label={product.name}>
      {/* Image */}
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
          {discount && <span className="badge badge-lime">-{discount}%</span>}
          {!product.in_stock && <span className="badge badge-dark">Agotado</span>}
          {product.tags?.find(t => t && typeof t === 'string' && t.startsWith('BADGE:')) && (
            <span className="badge badge-lime">
              {product.tags.find(t => t && typeof t === 'string' && t.startsWith('BADGE:'))!.replace('BADGE:', '')}
            </span>
          )}
        </div>

        {/* Quick add overlay */}
        <div className="product-card__overlay">
          <button
            onClick={handleAdd}
            className="product-card__add-btn"
            disabled={!product.in_stock}
          >
            {product.in_stock ? 'Agregar al carrito' : 'Sin stock'}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="product-card__info">
        {product.brand && (
          <p className="product-card__brand">{product.brand}</p>
        )}
        <h3 className="product-card__name">{product.name}</h3>
        <div className="product-card__price-row">
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
    </Link>
  );
};
