/**
 * seoRules.js — Divina Store MX
 * Una sola fuente de verdad para el SEO de la tienda. La usan:
 *   - el navegador (useSemantic.ts, Seo, páginas) y
 *   - el build (scripts/generate-sitemap.mjs y scripts/prerender-seo.mjs, en Node).
 * Por eso es JavaScript puro, sin dependencias. Los tipos están en seoRules.d.ts.
 *
 * Reglas de negocio que refleja (no inventar otras):
 *   - Envío $120 MXN por pedido; gratis desde $999 (src/lib/shipping.ts lo reexporta).
 *   - Productos 100% originales; pago con tarjeta procesado por Clip.
 *   - No hay devoluciones (MerchantReturnNotPermitted).
 */

export const SITE_URL = 'https://www.divinastore.com.mx';
export const SITE_NAME = 'Divina Store MX';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`;
export const STORAGE_BUCKET = 'divina-assets';

export const SHIPPING_COST = 120;
export const FREE_SHIPPING_FROM = 999;

export const HOME_TITLE = 'Skincare original en México | ISDIN, La Roche-Posay | Divina Store';
export const HOME_DESCRIPTION =
  'Compra skincare 100% original de ISDIN, La Roche-Posay, Avène, CeraVe y más. Pago seguro con tarjeta y envío a todo México, gratis desde $999.';

const TITLE_MAX = 58;   // + " | Divina Store" ≈ 73: lo que Google suele mostrar completo
const DESC_MAX = 158;

/* ───────────────────────── utilidades de texto ───────────────────────── */

const stripAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Texto plano desde HTML/markdown simple. */
export function plainText(value) {
  return squash(String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[#*_`>]/g, ' '))
    .replace(/\s+([,.;:!?])/g, '$1'); // "rostro , y" → "rostro, y"
}

/** "Cremas Faciales" → "cremas-faciales" (sin acentos ni signos). */
export function slugify(value) {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Formato de precio mexicano: 1020 → "$1,020", 135.5 → "$135.50". */
export function money(n) {
  const v = Number(n) || 0;
  const hasCents = Math.round(v * 100) % 100 !== 0;
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// Siglas y marcas que se escriben siempre en mayúsculas.
const KEEP_UPPER = new Set(['ISDIN', 'SPF', 'FPS', 'UV', 'UVA', 'UVB', 'AHA', 'BHA', 'PHA', 'PH', 'XL', 'MX', 'CBD', 'B3', 'B5']);
// Unidades que van en minúscula ("400 ML" → "400 ml").
const UNITS = new Set(['ml', 'g', 'mg', 'kg', 'oz', 'l', 'mm', 'cm']);
// Palabras de enlace que van en minúscula dentro de un título.
// (Los artículos La/El no se tocan: forman parte de marcas como "La Roche-Posay".)
const SMALL = new Set(['y', 'e', 'o', 'u', 'de', 'del', 'con', 'sin', 'para', 'por', 'en', 'a', 'al']);

function caseWord(word, index) {
  if (!word) return word;
  const bare = word.replace(/[^\p{L}\p{N}]/gu, '');
  if (!bare) return word;
  const upper = bare.toUpperCase();
  if (index > 0 && UNITS.has(bare.toLowerCase())) return word.toLowerCase();
  if (KEEP_UPPER.has(upper)) return word.toUpperCase();
  if (/\d/.test(bare)) return word; // 50ml, 0.25MM, 2PZS, B12…
  const lower = word.toLowerCase();
  if (index > 0 && SMALL.has(lower)) return lower;
  // Palabras TODO MAYÚSCULAS ("NEUTROGENA", "FUSION") → "Neutrogena", "Fusion".
  if (bare.length > 2 && bare === upper) return lower.charAt(0).toUpperCase() + lower.slice(1);
  // Palabra Con Mayúscula Inicial: se respeta tal cual (marcas tipo "Roche-Posay", "CeraVe").
  return word;
}

/** Limpia el nombre: espacios, comas pegadas, MAYÚSCULAS sueltas y conectores. */
export function cleanName(name) {
  const base = squash(String(name ?? '').replace(/\s*,\s*/g, ', ').replace(/\s*-\s+/g, ' - '));
  return base.split(' ').map((w, i) => caseWord(w, i)).join(' ').replace(/,\s*original(es)?\s*$/i, '').replace(/,\s*$/, '');
}

/** Recorta en coma (si conserva buena parte del texto) o en espacio, sin cortar palabras ni dejar conectores colgando. */
function cut(text, max) {
  if (text.length <= max) return text;
  const tidy = (t) => {
    if (t.split('(').length > t.split(')').length) t = t.slice(0, t.lastIndexOf('('));
    let words = t.replace(/[,;:\-–(\s]+$/, '').split(' ');
    while (words.length > 1 && SMALL.has(words[words.length - 1].toLowerCase())) words = words.slice(0, -1);
    return words.join(' ').replace(/[,;:\-–(\s]+$/, '');
  };
  const parts = text.split(', ');
  let byComma = parts[0];
  for (let i = 1; i < parts.length && `${byComma}, ${parts[i]}`.length <= max; i++) byComma = `${byComma}, ${parts[i]}`;
  if (byComma.length <= max && byComma.length >= max * 0.6) return tidy(byComma);
  const slice = text.slice(0, max + 1);
  const space = slice.lastIndexOf(' ');
  return tidy(slice.slice(0, space > 20 ? space : max));
}

/** Marca legible ("DOVE" → "Dove", "derma roller" → "Derma Roller"). */
export function cleanBrand(brand) {
  const b = squash(brand);
  if (!b) return '';
  if (KEEP_UPPER.has(b.toUpperCase())) return b.toUpperCase();
  if (b === b.toLowerCase() || b === b.toUpperCase()) {
    return b.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, s, c) => s + c.toUpperCase());
  }
  return b;
}

const nameHasBrand = (name, brand) => {
  const n = slugify(name).replace(/-/g, '');
  const b = slugify(brand).replace(/-/g, '');
  return !b || n.includes(b);
};

/* ───────────────────────── imágenes ───────────────────────── */

/**
 * URL absoluta de una imagen guardada en Supabase Storage (o ya absoluta).
 * Google exige URLs absolutas en og:image y en el schema de Product.
 */
export function absoluteImage(path, supabaseUrl) {
  const p = String(path ?? '').trim();
  if (!p) return DEFAULT_OG_IMAGE;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/')) return `${SITE_URL}${p}`;
  const base = String(supabaseUrl ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  if (!base) return DEFAULT_OG_IMAGE;
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${p.replace(/^\/+/, '')}`;
}

/* ───────────────────────── colecciones ───────────────────────── */

/** Una sola URL por colección: la que usa el menú (/coleccion/cremas-faciales). */
export function collectionPath(collection) {
  const fromName = slugify(collection?.name);
  return `/coleccion/${fromName || collection?.slug || ''}`;
}

export function collectionTitle(name) {
  return `${cleanName(name)} originales en México | Divina Store`;
}

export function collectionDescription(name, description) {
  const n = cleanName(name);
  const own = plainText(description);
  const tail = ` Pago seguro y envío a todo México, gratis desde ${money(FREE_SHIPPING_FROM)}.`;
  if (own && own.length + tail.length <= DESC_MAX) return `${own.replace(/[.\s]+$/, '')}.${tail}`;
  if (own) return cut(own, DESC_MAX - 1) + '.';
  return `Compra ${n.toLowerCase()} 100% originales de las mejores marcas de dermocosmética.${tail}`.slice(0, DESC_MAX);
}

/* ───────────────────────── productos ───────────────────────── */

/** Título del producto: marca + nombre limpio, corto, y la tienda. */
export function productTitle(product) {
  const brand = cleanBrand(product?.brand);
  let name = cleanName(product?.name);
  if (brand && !nameHasBrand(name, brand)) name = `${brand} ${name}`;
  return `${cut(name, TITLE_MAX)} | Divina Store`;
}

/** Primer beneficio útil (array de beneficios o primera frase corta de la descripción). */
function firstBenefit(product) {
  const list = Array.isArray(product?.benefits) ? product.benefits : [];
  const b = list.map(plainText).find((x) => x && x.length <= 90);
  if (b) return b.replace(/[.\s]+$/, '');
  const sentence = plainText(product?.description).split(/(?<=[.!?])\s/)[0] || '';
  const s = sentence.replace(/[.\s]+$/, '');
  if (s.length >= 25 && s.length <= 90 && s !== s.toUpperCase()) return s;
  return '';
}

/**
 * Meta description vendedora, generada por reglas (gratis, sin IA):
 * nombre + original + precio (y precio anterior) + beneficio + pago seguro + envío.
 * Se recorta por prioridad para no pasar de 158 caracteres.
 */
export function productDescription(product) {
  const brand = cleanBrand(product?.brand);
  const fullName = cleanName(product?.name);
  const price = Number(product?.price) || 0;
  const compare = Number(product?.compare_price) || 0;
  const hasDeal = compare > price && price > 0 && (1 - price / compare) >= 0.01;
  const priceText = price > 0 ? (hasDeal ? ` a ${money(price)} (antes ${money(compare)})` : ` a ${money(price)} MXN`) : '';
  const ship = price >= FREE_SHIPPING_FROM
    ? 'Envío gratis a todo México.'
    : `Envío a todo México: ${money(SHIPPING_COST)}, gratis desde ${money(FREE_SHIPPING_FROM)}.`;
  const benefit = firstBenefit(product);
  const ofBrand = brand && !nameHasBrand(fullName, brand) ? ` de ${brand}` : '';

  const build = (name, withBenefit, withPay, buy = true) => squash([
    `${buy ? 'Compra ' : ''}${name}${/\boriginal(es)?\b/i.test(name) ? '' : ' original'}${ofBrand}${priceText}.`,
    withBenefit && benefit ? `${benefit}.` : '',
    withPay ? 'Pago seguro con tarjeta.' : '',
    ship,
  ].join(' '));

  const short60 = cut(fullName, 60);
  const attempts = [
    [fullName, true, true, true],
    [fullName, false, true, true],
    [fullName, false, true, false],
    [fullName, false, false, true],
    [short60, false, true, true],
    [short60, false, false, true],
    [cut(fullName, 45), false, false, true],
  ];
  for (const [n, b, p, c] of attempts) {
    const text = build(n, b, p, c);
    if (text.length <= DESC_MAX) return text;
  }
  return cut(build(cut(fullName, 40), false, false), DESC_MAX);
}

const GTIN_RE = /^\d{8}$|^\d{12,14}$/;

/**
 * Schema.org Product completo para Google (resultados enriquecidos y Merchant listings).
 * Sólo datos reales: no se agregan reseñas ni calificaciones que no existen.
 */
export function productSchema(product, { supabaseUrl, collection } = {}) {
  const path = `/producto/${encodeURIComponent(product.slug)}`;
  const url = `${SITE_URL}${path}`;
  const price = Number(product.price) || 0;
  const gallery = [product.image_url, ...(Array.isArray(product.images) ? product.images : [])]
    .filter(Boolean)
    .map((p) => absoluteImage(p, supabaseUrl));
  const images = [...new Set(gallery)];
  const brand = cleanBrand(product.brand);
  const ean = String(product.ean ?? '').replace(/\D/g, '');
  const own = plainText(product.description);

  const offer = {
    '@type': 'Offer',
    url,
    priceCurrency: 'MXN',
    price: price.toFixed(2),
    availability: product.in_stock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: price >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST, currency: 'MXN' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'MX' },
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'MX',
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    },
  };

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: cleanName(product.name),
    url,
    sku: String(product.id ?? product.slug),
    description: own ? own.slice(0, 5000) : productDescription(product),
    image: images.length ? images : [DEFAULT_OG_IMAGE],
    offers: offer,
  };
  if (brand) schema.brand = { '@type': 'Brand', name: brand };
  if (GTIN_RE.test(ean)) schema.gtin = ean;
  if (collection?.name) schema.category = cleanName(collection.name);
  return schema;
}

/** Migas de pan Inicio › Colección › Producto. */
export function productBreadcrumb(product, collection) {
  const url = `${SITE_URL}/producto/${encodeURIComponent(product.slug)}`;
  const items = [{ name: 'Inicio', item: `${SITE_URL}/` }];
  if (collection?.name) items.push({ name: cleanName(collection.name), item: `${SITE_URL}${collectionPath(collection)}` });
  else items.push({ name: 'Catálogo', item: `${SITE_URL}/catalogo` });
  items.push({ name: cleanName(product.name), item: url });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, ...it })),
  };
}

/* ───────────────────────── tienda ───────────────────────── */

/** Redes sociales válidas para sameAs (sólo URLs http/https). */
export function socialProfiles(config = {}) {
  return [
    config.footer_facebook_url,
    config.footer_x_url || config.footer_twitter_url,
    config.footer_instagram_url,
  ].map((u) => String(u ?? '').trim()).filter((u) => /^https?:\/\//i.test(u)).filter((u, i, a) => a.indexOf(u) === i);
}

/** Schema de la tienda (todas las páginas). */
export function storeSchema(config = {}) {
  const sameAs = socialProfiles(config);
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${SITE_URL}/#store`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: 'Tienda en línea de skincare y dermocosmética 100% original en México: ISDIN, La Roche-Posay, Avène, CeraVe y más.',
    image: DEFAULT_OG_IMAGE,
    logo: `${SITE_URL}/favicon.ico`,
    priceRange: '$$',
    currenciesAccepted: 'MXN',
    paymentAccepted: 'Tarjeta de crédito, Tarjeta de débito',
    areaServed: { '@type': 'Country', name: 'México' },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Benito Juárez',
      addressRegion: 'CDMX',
      postalCode: '03100',
      addressCountry: 'MX',
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}
