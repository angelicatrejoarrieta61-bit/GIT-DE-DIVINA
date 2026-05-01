import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProductsByCollection, getCollectionBySlug, getStoreConfig } from '../lib/queries';
import { getImageUrl, supabase } from '../lib/supabase';
import { ProductCard } from '../components/ProductCard';
import type { Product, Collection } from '../types';
import './CollectionPage.css';

export const CollectionPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    getStoreConfig().then(setConfig);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        const payload = event.data.payload;
        setConfig(prev => ({ ...prev, ...payload }));
        
        if (payload._collections) {
          try {
            const cols = JSON.parse(payload._collections);
            const myCol = cols.find((c: any) => c.slug === slug);
            if (myCol) setCollection(myCol);
          } catch {}
        }
      }
    };
    window.addEventListener('message', handleMessage);

    const channel = supabase.channel('collection_config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_config' }, () => {
        getStoreConfig().then(setConfig);
      })
      .subscribe();

    return () => {
      window.removeEventListener('message', handleMessage);
      supabase.removeChannel(channel);
    };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    
    const fetchRelatedAndProducts = async () => {
      const [prods, col] = await Promise.all([
        getProductsByCollection(slug),
        getCollectionBySlug(slug)
      ]);
      setProducts(prods);
      setCollection(col);
      const blockId = col?.id || slug;
      const { data } = await supabase
        .from('products')
        .select('*, collection:collections!category(id,name,slug)')
        .contains('tags', [`REL_${blockId}`])
        .eq('in_stock', true);
      setRelated(data ?? []);
      setLoading(false);
    };

    fetchRelatedAndProducts();

    const productChannel = supabase.channel(`collection_products_${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchRelatedAndProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(productChannel);
    };
  }, [slug]);

  const blockId = collection?.id || slug;
  
  const bgImg = config[`col_${blockId}_hero_img`] 
    ? getImageUrl(config[`col_${blockId}_hero_img`], { width: 1920, quality: 80 }) 
    : collection?.image_url 
      ? getImageUrl(collection.image_url, { width: 1920, quality: 80 }) 
      : undefined;

  const bgX = config[`col_${blockId}_hero_img_x`] || '0';
  const bgY = config[`col_${blockId}_hero_img_y`] || '0';
  const cardX = config[`col_${blockId}_hero_card_x`] || '0';
  const cardY = config[`col_${blockId}_hero_card_y`] || '0';
  const cardScale = config[`col_${blockId}_hero_card_scale`] ? parseInt(config[`col_${blockId}_hero_card_scale`]) / 100 : 1;

  const catTitle = config[`col_${blockId}_hero_title`] || collection?.name || (slug?.toUpperCase().replace(/-/g, ' '));
  const catSub = config[`col_${blockId}_hero_subtitle`] || collection?.description;

  return (
    <div className="collection-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Banner */}
      <div 
        className="collection-page__banner"
      >
        {bgImg && (
          <img 
            src={bgImg} 
            alt="Hero Background" 
            className="collection-page__bg-img"
            style={{ 
              '--bg-x': `${bgX}px`, 
              '--bg-y': `${bgY}px`
            } as React.CSSProperties} 
          />
        )}
        <div className="collection-page__banner-overlay" style={{ zIndex: 2 }} />
        <div 
          className="page-width collection-page__banner-content glass"
          style={{
            '--card-x': `${cardX}px`,
            '--card-y': `${cardY}px`,
            '--card-scale': cardScale
          } as React.CSSProperties}
        >
          <div className="divider" style={{ marginBottom: 16 }} />
          <h1 className="collection-page__title">
            {catTitle}
          </h1>
          {catSub && (
            <p className="collection-page__desc muted-text">{catSub}</p>
          )}
          <p className="collection-page__count muted-text" style={{ marginTop: 12, fontSize: 11, letterSpacing: '0.1em' }}>
            {loading ? '...' : `${products.length} PRODUCTOS`}
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <div style={{ background: '#0a0a0a', padding: '60px 0' }}>
          <div className="page-width">
            <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: 24, marginBottom: 24, paddingLeft: 10, borderLeft: '2px solid var(--c-lime)' }}>
              Destacados
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {related.map(p => <ProductCard key={p.id} product={p} featured={true} />)}
            </div>
          </div>
        </div>
      )}

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
        ) : products.length === 0 && related.length === 0 ? (
          <div className="collection-page__empty">
            <p>No hay productos en esta sección aún.</p>
            <Link to="/catalogo" className="btn btn-lime" style={{ marginTop: 20 }}>Ver todo el catálogo</Link>
          </div>
        ) : products.length > 0 ? (
          <div className="collection-page__grid">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
};
