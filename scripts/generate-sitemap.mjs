import 'dotenv/config';
import { writeFile } from 'node:fs/promises';

const SITE_URL = 'https://www.divinastore.com.mx';
const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseUrl = rawSupabaseUrl?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('No se puede generar sitemap.xml: faltan las variables de Supabase.');
}

async function fetchSlugs(table, filter = '') {
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}?select=slug${filter}`;
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
  return data.map(row => row.slug).filter(Boolean);
}

// Consultas consecutivas: evita conexiones simultáneas innecesarias durante el build.
const collections = await fetchSlugs('collections');
const products = await fetchSlugs('products', '&in_stock=eq.true');
const posts = await fetchSlugs('blog_posts', '&published=eq.true');

const urls = [
  ['/', 'daily', '1.0'],
  ['/catalogo', 'daily', '0.9'],
  ['/quienes-somos', 'monthly', '0.6'],
  ['/contacto', 'monthly', '0.5'],
  ['/blog', 'weekly', '0.7'],
  ...collections.map(slug => [`/coleccion/${encodeURIComponent(slug)}`, 'weekly', '0.8']),
  ...products.map(slug => [`/producto/${encodeURIComponent(slug)}`, 'weekly', '0.8']),
  ...posts.map(slug => [`/blog/${encodeURIComponent(slug)}`, 'monthly', '0.6']),
];

const uniqueUrls = [...new Map(urls.map(entry => [entry[0], entry])).values()];
const lastmod = new Date().toISOString().slice(0, 10);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniqueUrls.map(([path, changefreq, priority]) => `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml, 'utf8');
console.log(`sitemap.xml generado con ${uniqueUrls.length} URLs de ${SITE_URL}`);
