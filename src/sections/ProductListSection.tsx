import React from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';
import './ProductListSection.css';

interface Props {
  products: Product[];
}

export const ProductListSection: React.FC<Props> = ({ products }) => {
  return (
    <section className="product-list-section section" id="productos">
      <div className="page-width">
        <div className="product-list-section__header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '14px' }}>
            <h2 className="product-list-section__title">
              Nuestros Productos <span className="lime-text">más Vendidos.</span>
            </h2>
            <Link to="/catalogo" className="btn btn-outline product-list-section__cta" style={{ borderRadius: '100px', fontSize: '11px', padding: '10px 24px', letterSpacing: '0.1em' }}>
              VER TODO
            </Link>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="product-list-section__skeleton">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 340, borderRadius: 20 }} />
            ))}
          </div>
        ) : (
          <div className="product-list-section__grid">
            {products.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
