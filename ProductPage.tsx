import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getProductBySlug } from '../lib/queries';
import { getImageUrl, getImageSrcSet } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';
import type { Product } from '../types';
import './ProductPage.css';

export const ProductPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState<string>('');
  
  const addItem = useCartStore(s => s.addItem);

  useEffect(() => {
    if (!slug) return;
    getProductBySlug(slug).then(p => { 
      setProduct(p); 
      if (p?.image_url) setActiveImage(p.image_url);
      setLoading(false); 
    });
  }, [slug]);

  const handleAdd = () => {
    if (!product) return;
    for (let i = 0; i < qty; i++) addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (loading) return (
    <div style={{ paddingTop: 'calc(var(--nav-h) + 60px)' }} className="page-width">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
        <div className="skeleton" style={{ height: 520, borderRadius: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[80, 200, 60, 100, 48].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 12 }} />)}
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div style={{ paddingTop: 'calc(var(--nav-h) + 60px)', textAlign: 'center' }} className="page-width section">
      <h2>Producto no encontrado</h2>
    </div>
  );

  const gallery = product.images && product.images.length > 0 ? product.images : (product.image_url ? [product.image_url] : []);

  return (
    <div className="product-page" style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="page-width section">
        <div className="product-page__grid">
          {/* Gallery Area */}
          <div className="product-page__gallery">
            <div className="product-page__media">
              {activeImage ? (
                <img 
                  src={getImageUrl(activeImage, { width: 1200, quality: 80 })} 
                  srcSet={getImageSrcSet(activeImage, [600, 1200], { quality: 80 })}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  alt={product.name} 
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="product-page__placeholder">🌿</div>
              )}
            </div>
            
            {gallery.length > 1 && (
              <div className="product-page__thumbnails">
                {gallery.map((img, idx) => (
                  <button 
                    key={idx} 
                    className={`product-page__thumb ${activeImage === img ? 'active' : ''}`}
                    onClick={() => setActiveImage(img)}
                  >
                    <img src={getImageUrl(img, { width: 120, quality: 65 })} alt={`Thumbnail ${idx + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="product-page__info">
            {product.brand && <p className="product-page__brand">{product.brand}</p>}
            <h1 className="product-page__name">{product.name}</h1>

            <div className="product-page__price-row">
              <span className="product-page__price">
                ${product.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </span>
              {product.compare_price && product.compare_price > product.price && (
                <span className="product-page__compare">
                  ${product.compare_price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {product.description && (
              <div 
                className="product-page__desc html-content" 
                dangerouslySetInnerHTML={{ __html: product.description }} 
              />
            )}

            {/* Quantity */}
            <div className="product-page__qty-row">
              <label className="product-page__label">Cantidad</label>
              <div className="product-page__qty">
                <button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                <span>{qty}</span>
                <button onClick={() => setQty(q => q + 1)}>+</button>
              </div>
            </div>

            {/* Add to cart */}
            <button
              className={`btn product-page__add-btn ${added ? 'added' : ''}`}
              onClick={handleAdd}
              disabled={!product.in_stock}
            >
              {!product.in_stock ? 'Sin inventario' : added ? '✓ Agregado al carrito' : 'Agregar al carrito'}
            </button>

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="product-page__tags">
                {product.tags.map(t => <span key={t} className="badge badge-dark">{t}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
