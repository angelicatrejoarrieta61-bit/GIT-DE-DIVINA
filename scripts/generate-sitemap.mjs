import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { collectionPath, absoluteImage, cleanName, socialProfiles } from '../src/lib/seoRules.js';

const SITE_URL = 'https://www.divinastore.com.mx';
const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseUrl = rawSupabaseUrl?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('No se puede generar sitemap.xml: faltan las variables de Supabase.');
}

async function fetchRows(table, select, filter = '') {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}?select=${encodeURIComponent(select)}${filter}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`No se pudieron leer ${table}: HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
}

// Consultas consecutivas: evita conexiones simultáneas innecesarias durante el build.
const collections = await fetchRows('collections', 'id,slug,name,description,image_url');
const products = await fetchRows('products', 'id,slug,name,brand,price,compare_price,description,benefits,image_url,images,in_stock,ean,category', '&in_stock=eq.true');
const posts = await fetchRows('blog_posts', 'slug,title,excerpt,cover_image,category,author,created_at', '&published=eq.true');

// Páginas de información creadas desde el admin (si falla, el build continúa sin ellas).
let pages = [];
let storeConfig = {};
try {
  const cfg = await fetchRows('store_config', 'key,value');
  const map = Object.fromEntries(cfg.map(r => [r.key, r.value]));
  // Sólo las redes del footer (para sameAs del schema de la tienda); nada más del config sale al build.
  storeConfig = Object.fromEntries(['footer_facebook_url', 'footer_x_url', 'footer_twitter_url', 'footer_instagram_url'].map(k => [k, map[k] || '']));
  const custom = JSON.parse(map.admin_custom_sections || '[]');
  pages = (Array.isArray(custom) ? custom : [])
    .filter(s => s?.type === 'page' && s?.key)
    .map(s => ({ slug: s.key, title: map[`page_${s.key}_title`] || s.label || s.key, body: map[`page_${s.key}_body`] || '' }));
} catch (err) {
  console.warn('Páginas de información omitidas del sitemap:', err?.message ?? err);
}

const urls = [
  ['/', 'daily', '1.0'],
  ['/catalogo', 'daily', '0.9'],
  ['/quienes-somos', 'monthly', '0.6'],
  ['/programa-promocion', 'monthly', '0.7'],
  ['/contacto', 'monthly', '0.5'],
  ['/blog', 'weekly', '0.7'],
  // Una sola URL por colección: la del menú (/coleccion/cremas-faciales), nunca el slug interno.
  ...collections.map(c => [collectionPath(c), 'weekly', '0.8']),
  ...products.map(p => [`/producto/${encodeURIComponent(p.slug)}`, 'weekly', '0.8', p]),
  ...posts.map(({ slug }) => [`/blog/${encodeURIComponent(slug)}`, 'monthly', '0.6']),
  ...pages.map(({ slug }) => [`/info/${encodeURIComponent(slug)}`, 'monthly', '0.4']),
];

const uniqueUrls = [...new Map(urls.map(entry => [entry[0], entry])).values()];
const lastmod = new Date().toISOString().slice(0, 10);
const xmlEscape = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
// Fotos de cada producto en el sitemap: ayudan a aparecer en Google Imágenes.
const imageTags = p => {
  if (!p) return '';
  const list = [...new Set([p.image_url, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean))].slice(0, 5);
  return list.map(img => `
    <image:image>
      <image:loc>${xmlEscape(absoluteImage(img, supabaseUrl))}</image:loc>
      <image:title>${xmlEscape(cleanName(p.name))}</image:title>
    </image:image>`).join('');
};
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${uniqueUrls.map(([path, changefreq, priority, product]) => `  <url>
    <loc>${xmlEscape(SITE_URL + path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${imageTags(product)}
  </url>`).join('\n')}
</urlset>
`;

await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml, 'utf8');
await writeFile(new URL('./.seo-data.json', import.meta.url), JSON.stringify({ supabaseUrl, collections, products, posts, pages, storeConfig }), 'utf8');
console.log(`sitemap.xml generado con ${uniqueUrls.length} URLs de ${SITE_URL} (redes para sameAs: ${socialProfiles(storeConfig).length})`);
