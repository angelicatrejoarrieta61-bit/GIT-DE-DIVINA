import React, { useEffect, useState } from 'react';
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
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
