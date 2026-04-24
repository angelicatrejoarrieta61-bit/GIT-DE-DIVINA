import React, { useEffect, useState } from 'react';
import { getProducts } from '../lib/queries';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';
import './CatalogPage.css';

export const CatalogPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts(48).then(p => { setProducts(p); setLoading(false); });
  }, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="catalog-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Banner */}
      <div className="catalog-page__banner">
        <div className="page-width catalog-page__banner-content">
          <h1 className="catalog-page__title">Catálogo <span className="lime-text">Completo</span></h1>
          <p className="muted-text">Explora todos nuestros productos de skincare y grooming</p>
        </div>
      </div>

      <div className="page-width section-sm">
        {/* Search */}
        <div className="catalog-page__search">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o marca..."
            className="input-dark catalog-page__search-input"
            aria-label="Buscar productos"
          />
          <span className="catalog-page__search-count muted-text">
            {filtered.length} productos
          </span>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="catalog-page__grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 340, borderRadius: 20 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="catalog-page__empty">
            <p>No se encontraron productos para "{search}"</p>
          </div>
        ) : (
          <div className="catalog-page__grid">
            {filtered.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
};
