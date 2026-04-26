import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
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

  const collectionName = collection?.name || slug?.toUpperCase().replace(/-/g, ' ') || '';
  const canonicalUrl = `https://git-de-divina.vercel.app/coleccion/${slug}`;

  const metaTitle = collection
    ? `${collection.name} | Skincare Premium Mexico — Divina Store MX`
    : 'Coleccion | Divina Store MX';

  const metaDescription = collection?.description
    ? `${collection.description} Compra ${collection.name} en Divina Store MX. Envio a CDMX y toda la republica.`
    : `Explora nuestra coleccion ${collectionName} en Divina Store MX. Skincare premium original con envio a CDMX y toda la republica.`;

  const collectionSchema = collection ? {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.name,
    description: metaDescription,
    url: canonicalUrl,
    ...(collection.image_url ? {
      image: getImageUrl(collection.image_url, { width: 1200, quality: 80 })
    } : {}),
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
          name: collection.name,
          item: canonicalUrl
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
  } : null;

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        {collection?.image_url && (
          <meta property="og:image" content={getImageUrl(collection.image_url, { width: 1200, quality: 80 })} />
        )}
        <meta property="og:locale" content="es_MX" />
        <meta property="og:site_name" content="Divina Store MX" />
        {collectionSchema && (
          <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
        )}
      </Helmet>

      <div className="collection-page" style={{ paddingTop: 'var(--nav-h)' }}>
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
            <h1 className="collection-page__title">{collectionName}</h1>
            {collection?.description && (
              <p className="collection-page__desc muted-text">{collection.description}</p>
            )}
            <p className="collection-page__count muted-text" style={{ marginTop: 12, fontSize: 11, letterSpacing: '0.1em' }}>
              {loading ? '...' : `${products.length} PRODUCTOS`}
            </p>
          </div>
        </div>

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
              <p>No hay productos en esta coleccion aun.</p>
              <Link to="/catalogo" className="btn btn-lime" style={{ marginTop: 20 }}>Ver todo el catalogo</Link>
            </div>
          ) : (
            <div className="collection-page__grid">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
};