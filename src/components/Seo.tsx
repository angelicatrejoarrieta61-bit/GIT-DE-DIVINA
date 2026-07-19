import React from 'react';
import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://www.divinastore.com.mx';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg`;

interface SeoProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
}

export const Seo: React.FC<SeoProps> = ({ title, description, path, image = DEFAULT_IMAGE, noindex = false }) => {
  const canonical = `${SITE_URL}${path === '/' ? '/' : path.replace(/\/$/, '')}`;

  return (
    <Helmet>
      <html lang="es-MX" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="es_MX" />
      <meta property="og:site_name" content="Divina Store MX" />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
};
