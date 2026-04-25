import React, { useEffect, useState } from 'react';
import { getProducts, getStoreConfig } from '../lib/queries';
import { getImageUrl, supabase } from '../lib/supabase';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '../types';
import './CatalogPage.css';
import './CollectionPage.css'; // For the hero banner styles

export const CatalogPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'relevance' | 'asc' | 'desc'>('relevance');
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});

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

  useEffect(() => {
    const fetchRelatedAndProducts = async () => {
      setLoading(true);
      const prods = await getProducts(100);
      setProducts(prods);

      const blockId = 'catalogo';
      const { data } = await supabase
        .from('products')
        .select('*, collection:collections(id,name,slug)')
        .contains('tags', [`REL_${blockId}`])
        .eq('in_stock', true);
      
      setRelated(data ?? []);
      setLoading(false);
    };

    fetchRelatedAndProducts();

    const productChannel = supabase.channel(`catalog_products`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchRelatedAndProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(productChannel);
    };
  }, []);

  let filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.brand ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (sortOrder === 'asc') {
    filtered = [...filtered].sort((a, b) => a.price - b.price);
  } else if (sortOrder === 'desc') {
    filtered = [...filtered].sort((a, b) => b.price - a.price);
  }

  const blockId = 'catalogo';
  
  const bgImg = config[`col_${blockId}_hero_img`] 
    ? getImageUrl(config[`col_${blockId}_hero_img`], { width: 1920, quality: 80 }) 
    : undefined;

  const bgX = config[`col_${blockId}_hero_img_x`] || '0';
  const bgY = config[`col_${blockId}_hero_img_y`] || '0';
  const cardX = config[`col_${blockId}_hero_card_x`] || '0';
  const cardY = config[`col_${blockId}_hero_card_y`] || '0';
  const cardScale = config[`col_${blockId}_hero_card_scale`] ? parseInt(config[`col_${blockId}_hero_card_scale`]) / 100 : 1;

  const catTitle = config[`col_${blockId}_hero_title`] || 'Catálogo Completo';
  const catSub = config[`col_${blockId}_hero_subtitle`] || 'Explora todos nuestros productos de skincare y grooming';

  return (
    <div className="catalog-page collection-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* Banner */}
      <div className="collection-page__banner">
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
              {related.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </div>
      )}

      <div className="page-width section-sm">
        {/* Search */}
        <div className="catalog-page__search" style={{ marginBottom: 32, display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o marca..."
            className="input-dark catalog-page__search-input"
            aria-label="Buscar productos"
            style={{ flex: 1, minWidth: '250px' }}
          />
          <select 
            className="input-dark" 
            value={sortOrder} 
            onChange={e => setSortOrder(e.target.value as 'relevance' | 'asc' | 'desc')}
            style={{ width: 'auto' }}
          >
            <option value="relevance">Ordenar por: Relevancia</option>
            <option value="asc">Precio: Menor a Mayor</option>
            <option value="desc">Precio: Mayor a Menor</option>
          </select>
          <span className="catalog-page__search-count muted-text" style={{ whiteSpace: 'nowrap' }}>
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
