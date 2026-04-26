import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { HeroSection } from '../sections/HeroSection';
import { CategoriesSection } from '../sections/CategoriesSection';
import { ProductListSection } from '../sections/ProductListSection';
import { FrostCardsSection } from '../sections/FrostCardsSection';
import { DynamicSections } from '../sections/DynamicSections';
import { getBestSellers, getCollections, getStoreConfig } from '../lib/queries';
import { supabase } from '../lib/supabase';
import type { Product, Collection } from '../types';

export const HomePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [heroImage, setHeroImage] = useState<string | undefined>();
  const [heroTitle, setHeroTitle] = useState<string | undefined>();
  const [heroSubtitle, setHeroSubtitle] = useState<string | undefined>();
  const [heroBtn1, setHeroBtn1] = useState<string | undefined>();
  const [heroBtn2, setHeroBtn2] = useState<string | undefined>();
  const [frostData, setFrostData] = useState<string | undefined>();
  const [dynamicBlocks, setDynamicBlocks] = useState<string | undefined>();
  const [catConfigs, setCatConfigs] = useState<Record<string, string>>({});

  useEffect(() => {
    getBestSellers(8).then(setProducts);
    getCollections().then(setCollections);

    const applyConfig = (cfg: Record<string, string>) => {
      setHeroImage(cfg.hero_image_url || undefined);
      setHeroTitle(cfg.hero_title || undefined);
      setHeroSubtitle(cfg.hero_subtitle || undefined);
      setHeroBtn1(cfg.hero_btn1 || undefined);
      setHeroBtn2(cfg.hero_btn2 || undefined);
      setFrostData(cfg.frost_cards_data);
      setDynamicBlocks(cfg.home_sections);
      const catCfg: Record<string, string> = {};
      Object.keys(cfg).forEach(k => {
        if (k.startsWith('cat_subtitle_')) catCfg[k] = cfg[k];
      });
      setCatConfigs(catCfg);
    };

    getStoreConfig().then(applyConfig);

    const channel = supabase
      .channel('home-config-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_config' },
        async () => {
          const fresh = await getStoreConfig();
          applyConfig(fresh);
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  const itemListSchema = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Productos mas vendidos Divina Store MX',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        url: `https://git-de-divina.vercel.app/producto/${p.slug}`,
        image: p.image_url || '',
        offers: {
          '@type': 'Offer',
          price: p.price,
          priceCurrency: 'MXN',
          availability: 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: 'Divina Store MX' }
        }
      }
    }))
  } : null;

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Divina Store MX',
    url: 'https://git-de-divina.vercel.app',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://git-de-divina.vercel.app/catalogo?q={search_term_string}'
      },
      'query-input': 'required name=search_term_string'
    }
  };

  return (
    <>
      <Helmet>
        <title>Divina Store MX | Skincare Premium ISDIN, La Roche-Posay, Vichy en Mexico</title>
        <meta name="description" content="Compra skincare premium en Mexico. ISDIN, La Roche-Posay, Vichy, serums, cremas y fotoprotectores originales. Precios accesibles, envio a CDMX y toda la republica." />
        <link rel="canonical" href="https://git-de-divina.vercel.app/" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://git-de-divina.vercel.app/" />
        <meta property="og:title" content="Divina Store MX | Skincare Premium en Mexico" />
        <meta property="og:description" content="ISDIN, La Roche-Posay, Vichy y mas. Skincare original con envio a CDMX y toda la republica." />
        <meta property="og:image" content="https://git-de-divina.vercel.app/og-image.jpg" />
        <meta property="og:locale" content="es_MX" />
        <script type="application/ld+json">{JSON.stringify(websiteSchema)}</script>
        {itemListSchema && (
          <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
        )}
      </Helmet>

      <HeroSection
        imageUrl={heroImage}
        title={heroTitle}
        subtitle={heroSubtitle}
        btn1={heroBtn1}
        btn2={heroBtn2}
      />
      <DynamicSections blocksData={dynamicBlocks} />
      <ProductListSection products={products} />
      <CategoriesSection collections={collections} catConfigs={catConfigs} />
      <FrostCardsSection data={frostData} />
    </>
  );
};