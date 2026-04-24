import React, { useEffect } from 'react';
import { getStoreConfig } from '../lib/queries';
import { supabase } from '../lib/supabase';

interface Config {
  font_heading?: string;
  font_sub?: string;
  font_body?: string;
  logo_height?: string;
  hero_card_x?: string;
  hero_card_y?: string;
  hero_card_visible?: string;
  hero_card_scale?: string;
  hero_image_x?: string;
  hero_image_y?: string;
  hero_image_scale?: string;
  hero_image_fit?: string;
}

export const StoreThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const applyConfig = (cfg: Config) => {
      const root = document.documentElement;

      // Defaults
      const heading = cfg.font_heading || 'Francois One';
      const sub = cfg.font_sub || 'Barlow Semi Condensed';
      const body = cfg.font_body || 'Catamaran';

      // Inject Google Fonts link
      const fontUrl = `https://fonts.googleapis.com/css2?family=${heading.replace(/ /g, '+')}:wght@400;600;700;800&family=${sub.replace(/ /g, '+')}:wght@300;400;500;600;700&family=${body.replace(/ /g, '+')}:wght@300;400;500;600;700;800&display=swap`;

      let link = document.getElementById('dynamic-google-fonts') as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.id = 'dynamic-google-fonts';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = fontUrl;

      // Apply CSS Variables
      root.style.setProperty('--f-heading', `"${heading}", sans-serif`);
      root.style.setProperty('--f-sub', `"${sub}", sans-serif`);
      root.style.setProperty('--f-body', `"${body}", sans-serif`);

      // Generic variables accessible via var() globally
      if (cfg.logo_height) root.style.setProperty('--logo-h', `${cfg.logo_height}px`);
      else root.style.setProperty('--logo-h', '40px');

      if (cfg.hero_card_visible) root.style.setProperty('--hero-card-display', cfg.hero_card_visible);
      else root.style.setProperty('--hero-card-display', 'flex');

      if (cfg.hero_card_x) root.style.setProperty('--hero-x', `${cfg.hero_card_x}px`);
      if (cfg.hero_card_y) root.style.setProperty('--hero-y', `${cfg.hero_card_y}px`);
      if (cfg.hero_card_scale) root.style.setProperty('--hero-scale', cfg.hero_card_scale);

      root.style.setProperty('--hero-img-x', `${cfg.hero_image_x || '0'}px`);
      root.style.setProperty('--hero-img-y', `${cfg.hero_image_y || '0'}px`);
      root.style.setProperty('--hero-img-scale', cfg.hero_image_scale || '1');
      root.style.setProperty('--hero-img-fit', cfg.hero_image_fit || 'cover');
    };

    getStoreConfig().then((cfg) => applyConfig(cfg as Config));

    const channel = supabase
      .channel('theme-config-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_config' },
        async () => {
          const fresh = await getStoreConfig();
          applyConfig(fresh as Config);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return <>{children}</>;
};
