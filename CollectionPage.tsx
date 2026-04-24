import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProductsByCollection, getCollectionBySlug, getStoreConfig } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import { ProductCard } from '../components/ProductCard';
import type { Product, Collection } from '../types';
import './CollectionPage.css';

export const CollectionPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    getStoreConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      getProductsByCollection(slug),
      getCollectionBySlug(slug),
    ]).then(([prods, col]) => {
      setProducts(prods);
      setCollection(col);
      setLoading(false);
    });
  }, [slug]);

  return (
    <div className="collection-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Banner */}
      <div 
        className="collection-page__banner"
        style={collection?.image_url ? {
           backgroundImage: `url(${getImageUrl(collection.image_url, { width: 1920, quality: 80 })})`,
           backgroundSize: 'cover',
           backgroundPosition: 'center',
        } : undefined}
      >
        <div className="collection-page__banner-overlay" />
        <div 
          className="page-width collection-page__banner-content glass"
          style={{
            maxWidth: 500,
            padding: 32,
            margin: 'auto 0 40px 0',
            transform: `translate(${config[`col_x_${collection?.id}`] || 0}px, ${config[`col_y_${collection?.id}`] || 0}px)`
          }}
        >
          <div className="divider" style={{ marginBottom: 16 }} />
          <h1 className="collection-page__title">
            {collection?.name || slug?.toUpperCase().replace(/-/g, ' ')}
          </h1>
          {collection?.description && (
            <p className="collection-page__desc muted-text">{collection.description}</p>
          )}
          <p className="collection-page__count muted-text" style={{ marginTop: 12, fontSize: 11, letterSpacing: '0.1em' }}>
            {loading ? '...' : `${products.length} PRODUCTOS`}
          </p>
        </div>
      </div>

      {/* Products */}
      <div className="page-width section">
        <nav className="collection-page__breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Inicio</Link>
          <span>/</span>
          <span>{collection?.name ?? slug}</span>
        </nav>

        {loading ? (
          <div className="collection-page__grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 340, borderRadius: 20 }} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="collection-page__empty">
            <p>No hay productos en esta colección aún.</p>
            <Link to="/catalogo" className="btn btn-lime" style={{ marginTop: 20 }}>Ver todo el catálogo</Link>
          </div>
        ) : (
          <div className="collection-page__grid">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
};
