import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';

const SITE = 'https://www.divinastore.com.mx';
const DEFAULT_IMAGE = `${SITE}/og-image.jpg`;
const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const data = JSON.parse(await readFile(new URL('./.seo-data.json', import.meta.url), 'utf8'));

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const plain = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const summary = (value, fallback) => (plain(value) || fallback).slice(0, 158);

function head({ title, description, path, image = DEFAULT_IMAGE, type = 'website', schema }) {
  const canonical = `${SITE}${path}`;
  const jsonLd = schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : '';
  return `<!-- SEO_PRERENDER_START -->
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image || DEFAULT_IMAGE)}" />
  <meta property="og:locale" content="es_MX" />
  <meta property="og:site_name" content="Divina Store MX" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image || DEFAULT_IMAGE)}" />
  ${jsonLd}
  <!-- SEO_PRERENDER_END -->`;
}

async function emit(route, meta) {
  const html = template.replace(/<!-- SEO_PRERENDER_START -->[\s\S]*?<!-- SEO_PRERENDER_END -->/, head(meta));
  const dir = new URL(`../dist${route}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL('index.html', dir), html, 'utf8');
}

const staticRoutes = [
  { path: '/catalogo', title: 'Catálogo de skincare original | Divina Store', description: 'Descubre skincare original de ISDIN, La Roche-Posay, Vichy y más, con envío a todo México.' },
  { path: '/quienes-somos', title: 'Quiénes somos | Divina Store', description: 'Conoce Divina Store, tienda mexicana de skincare original donde la belleza nace del corazón.' },
  { path: '/contacto', title: 'Contacto | Divina Store', description: 'Contacta a Divina Store para recibir ayuda con productos, pedidos y cuidado de la piel.' },
  { path: '/blog', title: 'Consejos de skincare | Blog Divina Store', description: 'Guías, rutinas e ingredientes para cuidar tu piel y elegir mejor tus productos de skincare.' },
];
for (const route of staticRoutes) await emit(route.path, route);

for (const c of data.collections) {
  const path = `/coleccion/${encodeURIComponent(c.slug)}`;
  await emit(path, { path, title: `${c.name} | Divina Store`, description: summary(c.description, `Compra ${c.name} original con envío a todo México.`), image: c.image_url || DEFAULT_IMAGE });
}
for (const p of data.products) {
  const path = `/producto/${encodeURIComponent(p.slug)}`;
  const title = `${p.name}${p.brand ? ` ${p.brand}` : ''} | Divina Store`;
  const description = summary(p.description, `Compra ${p.name} original con envío a todo México.`);
  await emit(path, { path, title, description, image: p.image_url || DEFAULT_IMAGE, type: 'product', schema: { '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, image: p.image_url, description, offers: { '@type': 'Offer', url: `${SITE}${path}`, priceCurrency: 'MXN', price: p.price, availability: 'https://schema.org/InStock' } } });
}
for (const p of data.posts) {
  const path = `/blog/${encodeURIComponent(p.slug)}`;
  const description = summary(p.excerpt, `Lee ${p.title} en el blog de Divina Store.`);
  await emit(path, { path, title: `${p.title} | Divina Store`, description, image: p.cover_image || DEFAULT_IMAGE, type: 'article', schema: { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description, image: p.cover_image, datePublished: p.created_at, author: { '@type': 'Person', name: p.author || 'Divina Store' }, mainEntityOfPage: `${SITE}${path}` } });
}

console.log(`Metadatos iniciales prerenderizados para ${staticRoutes.length + data.collections.length + data.products.length + data.posts.length} rutas.`);
await unlink(new URL('./.seo-data.json', import.meta.url));
