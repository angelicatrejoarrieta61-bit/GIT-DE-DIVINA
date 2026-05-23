/**
 * useSemantic.ts — Divina Store MX
 * Nanotecnología de información: convierte cada producto en un nodo
 * del Knowledge Graph de skincare más denso de México.
 *
 * Genera dinámicamente:
 *  - Product schema (Schema.org)
 *  - BreadcrumbList
 *  - FAQPage (si tiene faq)
 *  - ItemList de relacionados
 *  - Meta keywords expandidas
 *  - Canonical URL correcta (divinastore.com.mx, no vercel)
 */

import type { Product } from '../types';

const SITE_URL = 'https://www.divinastore.com.mx';
const SITE_NAME = 'Divina Store MX';

// Expansión semántica: sinónimos y términos relacionados por concern
const CONCERN_KEYWORDS: Record<string, string[]> = {
  arrugas:      ['antiarrugas', 'antiedad', 'líneas de expresión', 'lifting', 'rejuvenecimiento'],
  manchas:      ['antimanchas', 'despigmentante', 'hiperpigmentación', 'tono parejo', 'manchas solares'],
  acné:         ['antiacné', 'poros', 'seborrea', 'puntos negros', 'piel grasa', 'imperfecciones'],
  firmeza:      ['reafirmante', 'elasticidad', 'colágeno', 'tensor', 'flacidez'],
  luminosidad:  ['iluminador', 'brillo', 'efecto glow', 'vitamina C', 'tono uniforme'],
  hidratación:  ['hidratante', 'ácido hialurónico', 'humectante', 'piel seca', 'barrera cutánea'],
  poros:        ['minimizador de poros', 'piel texturizada', 'niacinamida', 'exfoliante'],
};

const SKIN_TYPE_KEYWORDS: Record<string, string[]> = {
  seca:      ['piel seca', 'hidratación profunda', 'piel deshidratada'],
  grasa:     ['piel grasa', 'control de brillos', 'matificante', 'seborrea'],
  mixta:     ['piel mixta', 'zona T', 'equilibrante'],
  sensible:  ['piel sensible', 'hipoalergénico', 'sin fragancia', 'calmante'],
  madura:    ['piel madura', 'antiedad', 'reafirmante', 'rejuvenecedor'],
  normal:    ['piel normal', 'mantenimiento', 'preventivo'],
};

const ROUTINE_LABELS: Record<string, string> = {
  'limpieza':         'Paso 1 — Limpieza',
  'tónico':           'Paso 2 — Tónico',
  'sérum':            'Paso 3 — Sérum',
  'contorno':         'Paso 4 — Contorno de ojos',
  'hidratante':       'Paso 5 — Hidratante',
  'protector-solar':  'Paso 6 — Protector solar',
  'tratamiento':      'Tratamiento especial',
};

export interface SemanticData {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  schemas: object[];
  ogImage: string;
}

export function buildProductSemantic(product: Product, slug: string): SemanticData {
  const productUrl = `${SITE_URL}/producto/${slug}`;
  const imageUrl   = product.image_url || '';

  // ── 1. Meta title con jerarquía de información ──────────────────────────
  const routineLabel = product.routine_step ? ROUTINE_LABELS[product.routine_step] : '';
  const concentration = product.concentration ? ` ${product.concentration}` : '';
  const title = [
    product.name,
    product.brand,
    concentration || routineLabel || '',
    'Divina Store MX',
  ].filter(Boolean).join(' | ');

  // ── 2. Meta description densa y natural ─────────────────────────────────
  const concerns = (product.concerns || []).join(', ');
  const skinTypes = (product.skin_types || []).map(s => `piel ${s}`).join(', ');
  const priceStr = `$${product.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

  const description = [
    `Compra ${product.name}${product.brand ? ` de ${product.brand}` : ''} en México.`,
    priceStr + ' con envío a CDMX y toda la república.',
    concerns ? `Ideal para: ${concerns}.` : '',
    skinTypes ? `Apto para ${skinTypes}.` : '',
    product.how_to_use ? '' : 'Producto 100% original en Divina Store MX.',
  ].filter(Boolean).join(' ').slice(0, 320);

  // ── 3. Keywords expandidas semánticamente ───────────────────────────────
  const baseKeywords = [
    product.name,
    product.brand || '',
    'skincare México',
    'Divina Store MX',
    ...(product.tags || []),
    ...(product.ingredients || []).slice(0, 5),
  ];

  const expandedConcerns = (product.concerns || [])
    .flatMap(c => CONCERN_KEYWORDS[c] || []);

  const expandedSkinTypes = (product.skin_types || [])
    .flatMap(s => SKIN_TYPE_KEYWORDS[s] || []);

  const keywords = [...new Set([
    ...baseKeywords,
    ...expandedConcerns,
    ...expandedSkinTypes,
    ...(product.meta_keywords || []),
  ])].filter(Boolean).join(', ');

  // ── 4. Product Schema ────────────────────────────────────────────────────
  const productSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: productUrl,
    description: product.description
      ? product.description.replace(/<[^>]*>/g, '').trim()
      : description,
    image: imageUrl,
    sku: product.id,
    brand: { '@type': 'Brand', name: product.brand || SITE_NAME },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      price: product.price,
      priceCurrency: 'MXN',
      availability: product.in_stock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', currency: 'MXN' },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'MX',
        },
      },
    },
    ...(product.compare_price && product.compare_price > product.price
      ? { hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow' } }
      : {}),
    ...(product.ingredients && product.ingredients.length > 0
      ? { material: product.ingredients.join(', ') }
      : {}),
    ...(product.benefits && product.benefits.length > 0
      ? { additionalProperty: product.benefits.map(b => ({ '@type': 'PropertyValue', name: 'Beneficio', value: b })) }
      : {}),
    ...(product.skin_types && product.skin_types.length > 0
      ? { audience: { '@type': 'Audience', audienceType: product.skin_types.map(s => `Piel ${s}`).join(', ') } }
      : {}),
  };

  // ── 5. BreadcrumbList ────────────────────────────────────────────────────
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Catálogo', item: `${SITE_URL}/catalogo` },
      ...(product.brand
        ? [{ '@type': 'ListItem', position: 3, name: product.brand, item: `${SITE_URL}/catalogo?brand=${encodeURIComponent(product.brand)}` }]
        : []),
      { '@type': 'ListItem', position: product.brand ? 4 : 3, name: product.name, item: productUrl },
    ],
  };

  // ── 6. FAQPage ───────────────────────────────────────────────────────────
  const schemas: object[] = [productSchema, breadcrumbSchema];

  if (product.faq && Array.isArray(product.faq) && product.faq.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: product.faq.map((item: { q: string; a: string }) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }

  // ── 7. ItemList de ingredientes activos (Knowledge Graph propio) ─────────
  if (product.ingredients_info && Array.isArray(product.ingredients_info) && product.ingredients_info.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Ingredientes activos de ${product.name}`,
      description: `Lista de ingredientes activos en ${product.name} de ${product.brand}`,
      itemListElement: product.ingredients_info.map((ing: { name: string; benefit: string; pct?: string }, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: ing.name,
        description: `${ing.benefit}${ing.pct ? ` — Concentración: ${ing.pct}` : ''}`,
      })),
    });
  }

  return { title, description, keywords, canonical: productUrl, schemas, ogImage: imageUrl };
}

/**
 * buildCollectionSemantic — para CollectionPage y CatalogPage
 */
export function buildCollectionSemantic(params: {
  name: string;
  slug: string;
  description?: string;
  products?: Product[];
}): SemanticData {
  const { name, slug, description, products = [] } = params;
  const collectionUrl = `${SITE_URL}/coleccion/${slug}`;

  const title = `${name} | Skincare Premium México — Divina Store MX`;
  const desc = description || `Descubre ${name} en Divina Store MX. Productos originales con envío a toda la república mexicana.`;

  const schemas: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name,
      url: collectionUrl,
      description: desc,
      provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: name, item: collectionUrl },
      ],
    },
  ];

  if (products.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${name} — Divina Store MX`,
      url: collectionUrl,
      numberOfItems: products.length,
      itemListElement: products.slice(0, 20).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/producto/${p.slug}`,
        name: p.name,
      })),
    });
  }

  return {
    title,
    description: desc.slice(0, 320),
    keywords: `${name}, skincare México, ${SITE_NAME}, productos originales`,
    canonical: collectionUrl,
    schemas,
    ogImage: `${SITE_URL}/og-image.jpg`,
  };
}
