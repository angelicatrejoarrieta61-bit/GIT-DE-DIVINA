/**
 * Redes sociales de la tienda (Facebook, X, Instagram).
 * Los enlaces se capturan en Admin → Footer → Redes sociales (store_config):
 *   footer_facebook_url · footer_x_url · footer_instagram_url
 * `footer_twitter_url` (campo antiguo) se usa como respaldo de X.
 * Solo se muestra un ícono si su enlace existe.
 */
import React from 'react';

export interface SocialLink { key: 'facebook' | 'x' | 'instagram'; label: string; url: string }

export function socialLinks(cfg: Record<string, string | undefined>): SocialLink[] {
  const list: SocialLink[] = [
    { key: 'facebook', label: 'Facebook', url: (cfg.footer_facebook_url || '').trim() },
    { key: 'x', label: 'X', url: (cfg.footer_x_url || cfg.footer_twitter_url || '').trim() },
    { key: 'instagram', label: 'Instagram', url: (cfg.footer_instagram_url || '').trim() },
  ];
  return list.filter((l) => /^https?:\/\//i.test(l.url));
}

export const SocialIcon: React.FC<{ name: SocialLink['key']; size?: number }> = ({ name, size = 16 }) => {
  if (name === 'facebook') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    );
  }
  if (name === 'x') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.902-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
};
