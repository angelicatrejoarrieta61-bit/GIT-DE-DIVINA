import React, { useEffect, useRef, useState } from 'react';
import { getStoreConfig } from '../lib/queries';
import { supabase } from '../lib/supabase';

interface Config {
  font_heading?: string;
  font_sub?: string;
  font_body?: string;
  logo_height?: string;
  header_menu_size?: string;
  hero_card_x?: string;
  hero_card_y?: string;
  hero_card_visible?: string;
  hero_card_scale?: string;
  hero_image_x?: string;
  hero_image_y?: string;
  hero_image_scale?: string;
  hero_image_fit?: string;
  [key: string]: string | undefined;
}

// ─── Carga una fuente de Google Fonts y la pre-carga con FontFace API ──────
async function loadGoogleFont(family: string, weights: string): Promise<void> {
  const familyEncoded = family.replace(/ /g, '+');
  const url = `https://fonts.googleapis.com/css2?family=${familyEncoded}:wght@${weights}&display=swap`;

  // Inyectar / actualizar el <link> para que el browser baje el CSS
  let link = document.getElementById(`gf-${family}`) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id  = `gf-${family}`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== url) link.href = url;

  // Esperar a que el browser descargue y parsee la font-face
  try {
    await document.fonts.load(`400 16px "${family}"`);
  } catch {
    // Si falla (offline, font inválido), ignorar silenciosamente
  }
}

export const StoreThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // fontKey se incrementa cada vez que cambia una fuente → fuerza re-render de children
  const [fontKey, setFontKey] = useState(0);
  const applyingRef = useRef(false);

  const applyConfig = async (cfg: Config) => {
    if (applyingRef.current) return;
    applyingRef.current = true;

    try {
      const root = document.documentElement;

      // ── Fuentes ─────────────────────────────────────────────────────
      const heading = cfg.font_heading || 'Francois One';
      const sub     = cfg.font_sub     || 'Barlow Semi Condensed';
      const body    = cfg.font_body    || 'Catamaran';

      const prevHeading = root.style.getPropertyValue('--f-heading');
      const prevSub     = root.style.getPropertyValue('--f-sub');
      const prevBody    = root.style.getPropertyValue('--f-body');

      // Aplicar CSS vars ANTES de cargar para respuesta inmediata
      root.style.setProperty('--f-heading', `"${heading}", sans-serif`);
      root.style.setProperty('--f-sub',     `"${sub}", sans-serif`);
      root.style.setProperty('--f-body',    `"${body}", sans-serif`);

      // Detectar si cambió alguna fuente
      const fontsChanged =
        !prevHeading.includes(heading) ||
        !prevSub.includes(sub) ||
        !prevBody.includes(body);

      // Cargar las 3 fuentes en paralelo
      await Promise.all([
        loadGoogleFont(heading, '400;600;700;800'),
        loadGoogleFont(sub,     '300;400;500;600;700'),
        loadGoogleFont(body,    '300;400;500;600;700;800'),
      ]);

      // Forzar repaint de todos los elementos de texto
      document.body.style.display = 'none';
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      document.body.offsetHeight; // layout flush
      document.body.style.display = '';

      // Si cambió alguna fuente, incrementar fontKey para re-renderizar children
      if (fontsChanged) setFontKey(k => k + 1);

      // ── Otras variables de tema ──────────────────────────────────────
      root.style.setProperty('--logo-h', cfg.logo_height
        ? `${String(cfg.logo_height).replace('px', '')}px`
        : '40px');

      root.style.setProperty('--header-menu-size', cfg.header_menu_size
        ? `${String(cfg.header_menu_size).replace('px', '')}px`
        : '13px');

      root.style.setProperty('--hero-card-display', cfg.hero_card_visible || 'flex');

      if (cfg.hero_card_x) root.style.setProperty('--hero-x', `${String(cfg.hero_card_x).replace('px', '')}px`);
      if (cfg.hero_card_y) root.style.setProperty('--hero-y', `${String(cfg.hero_card_y).replace('px', '')}px`);
      if (cfg.hero_card_scale) root.style.setProperty('--hero-scale', String(cfg.hero_card_scale));

      root.style.setProperty('--hero-img-x',     `${String(cfg.hero_image_x || '0').replace('px', '')}px`);
      root.style.setProperty('--hero-img-y',     `${String(cfg.hero_image_y || '0').replace('px', '')}px`);
      root.style.setProperty('--hero-img-scale', String(cfg.hero_image_scale || '1'));
      root.style.setProperty('--hero-img-fit',   String(cfg.hero_image_fit   || 'cover'));

    } finally {
      applyingRef.current = false;
    }
  };

  useEffect(() => {
    // Carga inicial desde Supabase
    getStoreConfig().then(cfg => applyConfig(cfg as Config));

    // Live preview desde el Admin (postMessage al iframe)
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ADMIN_PREVIEW_UPDATE') {
        applyConfig(e.data.payload as Config);
      }
    };
    window.addEventListener('message', handleMessage);

    // Realtime Supabase — cambios guardados desde otro tab o desde el admin
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
      window.removeEventListener('message', handleMessage);
      void supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fontKey como data-attribute para que React re-renderice children
  return <div key={fontKey} data-theme-key={fontKey} style={{ display: 'contents' }}>{children}</div>;
};
