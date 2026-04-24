import React, { useEffect, useState } from 'react';
import { HeroSection } from '../sections/HeroSection';
import { CategoriesSection } from '../sections/CategoriesSection';
import { ProductListSection } from '../sections/ProductListSection';
import { getBestSellers, getCollections, getStoreConfig } from '../lib/queries';
import { supabase } from '../lib/supabase';
import type { Product, Collection } from '../types';

// Orden por defecto si no hay nada guardado en Supabase
const DEFAULT_ORDER = ['home-hero', 'home-best-sellers', 'home-segmentos'];

export const HomePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [sectionOrder, setSectionOrder] = useState<string[]>(DEFAULT_ORDER);

  useEffect(() => {
    getBestSellers(8).then(setProducts);
    getCollections().then(setCollections);
    getStoreConfig().then(cfg => {
      setConfig(cfg);
      applyOrder(cfg);
    });

    // postMessage desde AdminConfig (preview en tiempo real)
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        const payload = e.data.payload as Record<string, string>;
        if (!payload || typeof payload !== 'object') return;
        setConfig(prev => {
          const next = { ...prev, ...payload };
          if (payload.home_layout_order) applyOrder(next);
          return next;
        });
      }
    };
    window.addEventListener('message', handler);

    // Supabase realtime — cualquier cambio en store_config
    const channel = supabase
      .channel('home-config-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_config' },
        async () => {
          const fresh = await getStoreConfig();
          setConfig(fresh);
          applyOrder(fresh);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('message', handler);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Lee home_layout_order del config y actualiza el orden de secciones
  const applyOrder = (cfg: Record<string, string>) => {
    if (!cfg.home_layout_order) return;
    const parts = cfg.home_layout_order.split(',').filter(Boolean);
    // Normalizar claves que vienen del AdminLayout
    const normalized = parts.map(p => {
      if (p === 'hero') return 'home-hero';
      if (p === 'products') return 'home-best-sellers';
      if (p === 'categories') return 'home-segmentos';
      return p;
    }).filter(p => ['home-hero', 'home-best-sellers', 'home-segmentos'].includes(p));

    if (normalized.length > 0) setSectionOrder(normalized);
  };

  const catConfigs: Record<string, string> = {};
  Object.keys(config).forEach(k => {
    if (k.startsWith('cat_subtitle_')) catConfigs[k] = config[k];
  });

  // Mapa de sección → componente
  const sectionMap: Record<string, React.ReactNode> = {
    'home-hero': (
      <HeroSection
        key="hero"
        imageUrl={config.hero_image_url || undefined}
        title={config.hero_title || undefined}
        subtitle={config.hero_subtitle || undefined}
        btn1={config.hero_btn1 || undefined}
        btn2={config.hero_btn2 || undefined}
      />
    ),
    'home-segmentos': (
      <CategoriesSection
        key="categories"
        collections={collections}
        catConfigs={catConfigs}
      />
    ),
    'home-best-sellers': (
      <ProductListSection
        key="products"
        products={products}
      />
    ),
  };

  return (
    <>
      {sectionOrder.map(id => sectionMap[id] ?? null)}
    </>
  );
};