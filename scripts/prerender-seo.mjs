/**
 * prerender-seo.mjs — corre después de `vite build`.
 * Escribe un HTML por ruta (dist/<ruta>.html) con título, descripción, canonical, Open Graph
 * y JSON-LD ya resueltos, para que Google y las redes los lean sin ejecutar JavaScript.
 * Las reglas de texto y schema son las mismas que usa la tienda en el navegador: src/lib/seoRules.js.
 */
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import {
  SITE_URL as SITE,
  DEFAULT_OG_IMAGE as DEFAULT_IMAGE,
  plainText,
  slugify,
  absoluteImage,
  collectionPath,
  collectionTitle,
  collectionDescription,
  productTitle,
  productDescription,
  productSchema,
  productBreadcrumb,
  storeSchema,
} from '../src/lib/seoRules.js';

const indexUrl = new URL('../dist/index.html', import.meta.url);
const data = JSON.parse(await readFile(new URL('./.seo-data.json', import.meta.url), 'utf8'));
const supabaseUrl = data.supabaseUrl || '';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const ldJson = schema => `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
const summary = (value, fallback) => {
  const text = plainText(value) || fallback;
  if (text.length <= 158) return text;
  const cut = text.slice(0, 156);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : 156)}…`;
};

// Schema de la tienda con las redes reales del footer (sameAs) en todas las páginas.
const storeBlock = `<!-- STORE_SCHEMA_START -->
  ${ldJson(storeSchema(data.storeConfig || {}))}
  <!-- STORE_SCHEMA_END -->`;
const template = (await readFile(indexUrl, 'utf8'))
  .replace(/<!-- STORE_SCHEMA_START -->[\s\S]*?<!-- STORE_SCHEMA_END -->/, () => storeBlock); // función: los "$" del texto no son patrones
// El home (y el fallback de la SPA) también lleva el schema actualizado.
await writeFile(indexUrl, template, 'utf8');

function head({ title, description, path, canonicalPath = path, image = DEFAULT_IMAGE, type = 'website', schemas = [] }) {
  const canonical = `${SITE}${canonicalPath}`;
  const img = escapeHtml(image || DEFAULT_IMAGE);
  return `<!-- SEO_PRERENDER_START -->
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:locale" content="es_MX" />
  <meta property="og:site_name" content="Divina Store MX" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${img}" />
  ${schemas.filter(Boolean).map(ldJson).join('\n  ')}
  <!-- SEO_PRERENDER_END -->`;
}

let emitted = 0;
async function emit(route, meta) {
  const html = template.replace(/<!-- SEO_PRERENDER_START -->[\s\S]*?<!-- SEO_PRERENDER_END -->/, () => head({ ...meta, path: route }));
  const segments = route.split('/').filter(Boolean);
  const fileName = `${segments.pop()}.html`;
  const dir = new URL(`../dist/${segments.join('/')}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(fileName, dir), html, 'utf8');
  emitted++;
}

const staticRoutes = [
  { path: '/catalogo', title: 'Catálogo de skincare original en México | Divina Store', description: 'Todo el skincare 100% original: ISDIN, La Roche-Posay, Avène, CeraVe y más. Pago seguro con tarjeta y envío a todo México, gratis desde $999.' },
  { path: '/quienes-somos', title: 'Quiénes somos | Divina Store MX', description: 'Conoce Divina Store, tienda mexicana de skincare 100% original donde la belleza nace del corazón.' },
  { path: '/programa-promocion', title: 'Programa de promoción: gana 12% | Divina Store', description: 'Recomienda productos Divina Store con tu código o liga personal y gana 12% por cada venta válida. Regístrate gratis.' },
  { path: '/contacto', title: 'Contacto | Divina Store MX', description: 'Contacta a Divina Store para recibir ayuda con productos, pedidos y cuidado de la piel.' },
  { path: '/blog', title: 'Consejos de skincare | Blog Divina Store', description: 'Guías, rutinas e ingredientes para cuidar tu piel y elegir mejor tus productos de skincare.' },
];
for (const route of staticRoutes) await emit(route.path, route);

// Colecciones: la URL canónica es la del menú (/coleccion/cremas-faciales). Si la colección
// también se abre por su slug interno (/coleccion/cremas-serums), ese HTML apunta al mismo canonical.
const collectionById = new Map();
for (const c of data.collections) {
  collectionById.set(c.id, c);
  const canonicalPath = collectionPath(c);
  const meta = {
    canonicalPath,
    title: collectionTitle(c.name),
    description: collectionDescription(c.name, c.description),
    image: c.image_url ? absoluteImage(c.image_url, supabaseUrl) : DEFAULT_IMAGE,
    schemas: [
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, url: `${SITE}${canonicalPath}` },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: c.name, item: `${SITE}${canonicalPath}` },
        ],
      },
    ],
  };
  const aliases = new Set([canonicalPath, `/coleccion/${encodeURIComponent(c.slug)}`]);
  if (slugify(c.slug) !== c.slug) aliases.add(`/coleccion/${slugify(c.slug)}`);
  for (const route of aliases) await emit(route, meta);
}

for (const p of data.products) {
  const path = `/producto/${encodeURIComponent(p.slug)}`;
  const collection = collectionById.get(p.category) || null;
  await emit(path, {
    title: productTitle(p),
    description: productDescription(p),
    image: absoluteImage(p.image_url, supabaseUrl),
    type: 'product',
    schemas: [productSchema(p, { supabaseUrl, collection }), productBreadcrumb(p, collection)],
  });
}

for (const p of data.posts) {
  const path = `/blog/${encodeURIComponent(p.slug)}`;
  const description = summary(p.excerpt, `Lee ${p.title} en el blog de Divina Store.`);
  const image = p.cover_image ? absoluteImage(p.cover_image, supabaseUrl) : DEFAULT_IMAGE;
  await emit(path, {
    title: `${p.title} | Divina Store`,
    description,
    image,
    type: 'article',
    schemas: [{
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: p.title,
      description,
      image,
      datePublished: p.created_at,
      author: { '@type': 'Person', name: p.author || 'Divina Store' },
      publisher: { '@type': 'Organization', name: 'Divina Store MX', url: SITE },
      mainEntityOfPage: `${SITE}${path}`,
    }],
  });
}

for (const page of data.pages ?? []) {
  const path = `/info/${encodeURIComponent(page.slug)}`;
  await emit(path, { title: `${page.title} | Divina Store MX`, description: summary(page.body, `${page.title} — Divina Store MX`) });
}

console.log(`Metadatos iniciales prerenderizados para ${emitted} rutas.`);
await unlink(new URL('./.seo-data.json', import.meta.url));
