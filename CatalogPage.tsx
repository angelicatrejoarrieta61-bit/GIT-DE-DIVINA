import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { getProducts } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
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

  const catalogSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Catalogo Completo — Divina Store MX',
    description: 'Explora todos los productos de skincare y grooming premium disponibles en Divina Store MX. ISDIN, La Roche-Posay, Vichy y mas.',
    url: 'https://git-de-divina.vercel.app/catalogo',
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Inicio',
          item: 'https://git-de-divina.vercel.app'
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Catalogo',
          item: 'https://git-de-divina.vercel.app/catalogo'
        }
      ]
    },
    ...(products.length > 0 ? {
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: products.length,
        itemListElement: products.slice(0, 10).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Product',
            name: p.name,
            url: `https://git-de-divina.vercel.app/producto/${p.slug}`,
            image: p.image_url ? getImageUrl(p.image_url, { width: 600, quality: 80 }) : '',
            brand: { '@type': 'Brand', name: p.brand || 'Divina Store MX' },
            offers: {
              '@type': 'Offer',
              price: p.price,
              priceCurrency: 'MXN',
              availability: p.in_stock
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock'
            }
          }
        }))
      }
    } : {})
  };

  return (
    <>
      <Helmet>
        <title>Catalogo Completo | Skincare y Grooming Premium — Divina Store MX</title>
        <meta name="description" content="Explora todos nuestros productos de skincare y grooming premium en Mexico. ISDIN, La Roche-Posay, Vichy y mas. Envio a CDMX y toda la republica." />
        <link rel="canonical" href="https://git-de-divina.vercel.app/catalogo" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://git-de-divina.vercel.app/catalogo" />
        <meta property="og:title" content="Catalogo Completo | Skincare Premium — Divina Store MX" />
        <meta property="og:description" content="ISDIN, La Roche-Posay, Vichy y mas. Skincare premium original con envio a CDMX y toda la republica." />
        <meta property="og:image" content="https://git-de-divina.vercel.app/og-image.jpg" />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:site_name" content="Divina Store MX" />
        <script type="application/ld+json">{JSON.stringify(catalogSchema)}</script>
      </Helmet>

      <div className="catalog-page" style={{ paddingTop: 'var(--nav-h)' }}>
        <div className="catalog-page__banner">
          <div className="page-width catalog-page__banner-content">
            <h1 className="catalog-page__title">Catalogo <span className="lime-text">Completo</span></h1>
            <p className="muted-text">Explora todos nuestros productos de skincare y grooming</p>
          </div>
        </div>

        <div className="page-width section-sm">
          <div className="catalog-page__search">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o marca..."
              className="input-dark catalog-page__search-input"
              aria-label="Buscar productos en Divina Store MX"
            />
            <span className="catalog-page__search-count muted-text">
              {filtered.length} productos
            </span>
          </div>

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
    </>
  );
};