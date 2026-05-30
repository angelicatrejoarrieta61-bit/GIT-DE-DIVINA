import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { getProducts, getStoreConfig } from '../lib/queries';
import { getImageUrl, supabase } from '../lib/supabase';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';
import './CatalogPage.css';
import './CollectionPage.css';

export const CatalogPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    getProducts(48).then(p => { setProducts(p); setLoading(false); });
  }, []);

  useEffect(() => {
    getStoreConfig().then(setConfig);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        const payload = event.data.payload;
        setConfig(prev => ({ ...prev, ...payload }));
      }
    };
    window.addEventListener('message', handleMessage);

    const channel = supabase.channel('catalog_config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_config' }, () => {
        getStoreConfig().then(setConfig);
      })
      .subscribe();

    return () => {
      window.removeEventListener('message', handleMessage);
      supabase.removeChannel(channel);
    };
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

  const blockId = 'catalogo';
  
  const bgImg = config[`col_${blockId}_hero_img`] 
    ? getImageUrl(config[`col_${blockId}_hero_img`], { width: 1920, quality: 80 }) 
    : undefined;

  const bgX = config[`col_${blockId}_hero_img_x`] || '0';
  const bgY = config[`col_${blockId}_hero_img_y`] || '0';
  const bgScale = config[`col_${blockId}_hero_img_scale`] || '1';
  const cardX = config[`col_${blockId}_hero_card_x`] || '0';
  const cardY = config[`col_${blockId}_hero_card_y`] || '0';
  const cardScale = config[`col_${blockId}_hero_card_scale`] ? parseInt(config[`col_${blockId}_hero_card_scale`]) / 100 : 1;

  const catTitle = config[`col_${blockId}_hero_title`] || 'Catálogo Completo';
  const catSub = config[`col_${blockId}_hero_subtitle`] || 'Explora todos nuestros productos de skincare y grooming';

  const showCard = !(config[`col_${blockId}_hero_title`] === '' && config[`col_${blockId}_hero_subtitle`] === '');

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

      <div className="collection-page catalog-page" style={{ paddingTop: 'var(--nav-h)' }}>
        {/* Banner */}
        <div className="collection-page__banner" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
          {bgImg && (
            <>
              {/* Blurred background stretched to fill (infinite edges) */}
              <div 
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `url(${bgImg})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  filter: 'blur(30px) brightness(0.6)',
                  zIndex: 1,
                  transform: 'scale(1.1)'
                }}
              />
              {/* Sharp centered image, not cut vertically */}
              <img 
                src={bgImg} 
                alt="Hero Background" 
                style={{ 
                  position: 'relative',
                  height: '100%',
                  width: 'auto',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  zIndex: 2,
                  display: 'block',
                  margin: '0 auto',
                  transform: `translate(${bgX}px, ${bgY}px) scale(${bgScale})`
                }} 
              />
            </>
          )}
          <div className="collection-page__banner-overlay" style={{ zIndex: 3 }} />
          {showCard && (
            <div 
              className="page-width collection-page__banner-content glass"
              style={{
                '--card-x': `${cardX}px`,
                '--card-y': `${cardY}px`,
                '--card-scale': cardScale,
                zIndex: 4
              } as React.CSSProperties}
            >
              <div className="divider" style={{ marginBottom: 16 }} />
              {config[`col_${blockId}_hero_title`] !== '' && (
                <h1 className="collection-page__title">
                  {catTitle}
                </h1>
              )}
              {config[`col_${blockId}_hero_subtitle`] !== '' && catSub && (
                <p className="collection-page__desc muted-text">{catSub}</p>
              )}
              <p className="collection-page__count muted-text" style={{ marginTop: 12, fontSize: 11, letterSpacing: '0.1em' }}>
                {loading ? '...' : `${filtered.length} PRODUCTOS`}
              </p>
            </div>
          )}
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