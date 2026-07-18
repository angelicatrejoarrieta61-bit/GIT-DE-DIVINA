
/**
 * BlogPostPage.tsx — Vista individual de artículo
 * Diseño premium oscuro consistente con Divina Store MX
 * BlogPostPage.tsx — Divina Store MX
 * SEO Enterprise: productos reales de Supabase integrados al articulo
 * Target: mujeres 40-60 años, Mexico, busquedas organicas Google
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getBlogPostBySlug, getRelatedPosts, type BlogPost } from '../../lib/blog-queries';
import { getProductsByBrandOrTags } from '../../lib/blog-queries';
import { getImageUrl } from '../../lib/supabase';
import type { Product } from '../../types';

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1200&q=80';
const SITE = 'https://www.divinastore.com.mx';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function injectHeadingIds(html: string): string {
  let i = 0;
  return html.replace(/<h2([^>]*)>/gi, () => `<h2 id="heading-${i++}" style="font-family:var(--f-heading);font-size:clamp(18px,2.5vw,24px);color:var(--c-white);margin:48px 0 16px;line-height:1.2;">`);
  return html.replace(/<h2([^>]*)>/gi, () =>
    `<h2 id="heading-${i++}" style="font-family:var(--f-heading);font-size:clamp(18px,2.5vw,24px);color:var(--c-white);margin:48px 0 16px;line-height:1.2;">`
  );
}

// ── Barra de progreso de lectura ─────────────────────────────────────────────
function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
@ -35,29 +46,106 @@ function ReadingProgress() {
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: '2px', background: 'rgba(255,255,255,0.08)' }}>
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: '3px', background: 'rgba(255,255,255,0.08)' }}>
      <div style={{ height: '100%', background: 'var(--c-lime)', width: `${progress}%`, transition: 'width 0.1s linear' }} />
    </div>
  );
}

// ── Tarjeta de producto real desde Supabase ──────────────────────────────────
function ProductCard({ product }: { product: Product }) {
  const [hovered, setHovered] = useState(false);
  const imgSrc = product.image_url ? getImageUrl(product.image_url, { width: 300, quality: 75 }) : FALLBACK_IMG;

  return (
    <Link
      to={`/producto/${product.slug}`}
      itemScope
      itemType="https://schema.org/Product"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: hovered ? 'rgba(255,255,255,0.05)' : 'var(--c-surface-2)',
        border: `1px solid ${hovered ? 'var(--c-lime)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'border-color 0.25s, background 0.25s, transform 0.25s',
        transform: hovered ? 'translateY(-4px)' : 'none',
        textDecoration: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Imagen */}
      <div style={{ height: '180px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={imgSrc}
          alt={`${product.name}${product.brand ? ` ${product.brand}` : ''} — Divina Store MX`}
          itemProp="image"
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s', transform: hovered ? 'scale(1.04)' : 'scale(1)' }}
        />
      </div>

      {/* Info */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, gap: '6px' }}>
        {product.brand && (
          <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)' }}
            itemProp="brand">
            {product.brand}
          </span>
        )}
        <p style={{ fontFamily: 'var(--f-heading)', fontSize: '14px', lineHeight: 1.25, color: 'var(--c-white)', margin: 0,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          itemProp="name">
          {product.name}
        </p>
        <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--f-sub)', fontSize: '15px', fontWeight: 700, color: 'var(--c-white)' }}
            itemProp="offers" itemScope itemType="https://schema.org/Offer">
            <span itemProp="priceCurrency" content="MXN" />
            <span itemProp="price" content={String(product.price)}>
              ${product.price.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--c-text-muted)', fontWeight: 400, marginLeft: '4px' }}>MXN</span>
          </span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)' }}>
            VER →
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export function BlogPostPage() {
  const { slug }     = useParams<{ slug: string }>();
  const navigate     = useNavigate();
  const [post, setPost]       = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    window.scrollTo(0, 0);

    getBlogPostBySlug(slug).then(data => {
      if (!data) { navigate('/blog', { replace: true }); return; }
      setPost(data);
      getRelatedPosts(data.category, slug, 3).then(setRelated);

      // Cargar relacionados y productos en paralelo
      Promise.all([
        getRelatedPosts(data.category, slug, 3),
        getProductsByBrandOrTags(data.tags ?? [], data.category),
      ]).then(([rel, prods]) => {
        setRelated(rel);
        setProducts(prods.slice(0, 4));
        setLoading(false);
      });
    });
  }, [slug, navigate]);

  if (loading) return (
@ -70,6 +158,49 @@ export function BlogPostPage() {
  if (!post) return null;

  const mins = readingTime(post.content);
  const canonical = `${SITE}/blog/${post.slug}`;
  const ogImage = post.cover_image || FALLBACK_IMG;

  // Fecha ISO para Schema
  const datePublished = new Date(post.created_at).toISOString();

  // Schema Article para Google
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: ogImage,
    datePublished,
    dateModified: datePublished,
    author: {
      '@type': 'Person',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Divina Store MX',
      url: SITE,
      logo: { '@type': 'ImageObject', url: `${SITE}/logo.svg` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    keywords: post.tags?.join(', ') ?? post.category,
    articleSection: post.category,
    inLanguage: 'es-MX',
  };

  // Schema BreadcrumbList
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
      { '@type': 'ListItem', position: 3, name: post.category, item: `${SITE}/blog?cat=${encodeURIComponent(post.category)}` },
      { '@type': 'ListItem', position: 4, name: post.title, item: canonical },
    ],
  };

  const html = injectHeadingIds(post.content)
    .replace(/<h3([^>]*)>/gi, '<h3 style="font-family:var(--f-sub);font-size:18px;font-weight:700;color:var(--c-white);margin:32px 0 12px;">')
    .replace(/<p>/gi, '<p style="color:rgba(255,255,255,0.72);font-size:16px;line-height:1.8;margin-bottom:20px;">')
@ -78,45 +209,93 @@ export function BlogPostPage() {

  return (
    <>
      {/* ── SEO Head ── */}
      <Helmet>
        <title>{post.title} | Blog Divina Store MX</title>
        <meta name="description" content={post.excerpt} />
        <meta name="keywords" content={post.tags?.join(', ') ?? post.category} />
        <link rel="canonical" href={canonical} />
        <meta name="robots" content="index, follow" />
        <meta name="author" content={post.author} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:locale" content="es_MX" />
        <meta property="og:site_name" content="Divina Store MX" />
        <meta property="article:published_time" content={datePublished} />
        <meta property="article:section" content={post.category} />
        {post.tags?.map(tag => <meta key={tag} property="article:tag" content={tag} />)}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />
        <meta name="twitter:image" content={ogImage} />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <ReadingProgress />

      <div style={{ background: 'var(--c-bg)', minHeight: '100vh' }}>

        {/* ── Hero imagen ── */}
        <div style={{ position: 'relative', height: 'clamp(260px, 45vw, 480px)', overflow: 'hidden' }}>
          <img src={post.cover_image || FALLBACK_IMG} alt={post.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <img
            src={ogImage}
            alt={post.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fetchPriority="high"
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%)' }} />
          {/* Breadcrumb encima */}

          {/* Breadcrumb sobre imagen */}
          <div style={{ position: 'absolute', top: '24px', left: 0, right: 0 }}>
            <div className="page-width">
              <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--f-sub)' }}>
                <Link to="/" style={{ color: 'rgba(255,255,255,0.5)', transition: 'color 0.2s' }}
              <nav aria-label="Ruta de navegación" itemScope itemType="https://schema.org/BreadcrumbList"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--f-sub)', flexWrap: 'wrap' }}>
                <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                  <Link to="/" itemProp="item" style={{ color: 'rgba(255,255,255,0.5)', transition: 'color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-lime)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}>Inicio</Link>
                <span>/</span>
                <Link to="/blog" style={{ color: 'rgba(255,255,255,0.5)', transition: 'color 0.2s' }}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}>
                    <span itemProp="name">Inicio</span>
                  </Link>
                  <meta itemProp="position" content="1" />
                </span>
                <span aria-hidden="true">/</span>
                <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                  <Link to="/blog" itemProp="item" style={{ color: 'rgba(255,255,255,0.5)', transition: 'color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-lime)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}>Blog</Link>
                <span>/</span>
                <span style={{ color: 'rgba(255,255,255,0.8)' }}>{post.category}</span>
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}>
                    <span itemProp="name">Blog</span>
                  </Link>
                  <meta itemProp="position" content="2" />
                </span>
                <span aria-hidden="true">/</span>
                <span itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
                  <span itemProp="name" style={{ color: 'rgba(255,255,255,0.8)' }}>{post.category}</span>
                  <meta itemProp="position" content="3" />
                </span>
              </nav>
            </div>
          </div>
        </div>

        {/* ── Contenido ── */}
        {/* ── Contenido principal ── */}
        <div className="page-width" style={{ paddingBlock: '48px 80px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr min(680px, 100%) 1fr', gap: '0 32px' }}>
            <div /> {/* spacer izquierdo */}
            <article>
              {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr min(720px, 100%) 1fr', gap: '0 32px' }}>
            <div />
            <article itemScope itemType="https://schema.org/Article">

              {/* Meta del articulo */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'var(--c-black)', background: 'var(--c-lime)',
                  padding: '4px 12px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
                }}>{post.category}</span>
                <time style={{ color: 'var(--c-text-muted)', fontSize: '13px', fontFamily: 'var(--f-sub)' }}>
                <time dateTime={datePublished} itemProp="datePublished"
                  style={{ color: 'var(--c-text-muted)', fontSize: '13px', fontFamily: 'var(--f-sub)' }}>
                  {formatDate(post.created_at)}
                </time>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
@ -125,43 +304,86 @@ export function BlogPostPage() {
                </span>
              </div>

              {/* Título */}
              <h1 style={{
              {/* Titulo H1 — keyword principal */}
              <h1 itemProp="headline" style={{
                fontFamily: 'var(--f-heading)',
                fontSize: 'clamp(26px, 4vw, 42px)',
                fontSize: 'clamp(26px, 4vw, 44px)',
                lineHeight: 1.05, color: 'var(--c-white)', marginBottom: '24px',
              }}>{post.title}</h1>

              {/* Excerpt visible — Google lo usa como snippet */}
              {post.excerpt && (
                <p itemProp="description" style={{
                  color: 'rgba(255,255,255,0.55)', fontSize: '17px', lineHeight: 1.7,
                  marginBottom: '32px', fontStyle: 'italic',
                  borderLeft: '3px solid var(--c-lime)', paddingLeft: '16px',
                }}>
                  {post.excerpt}
                </p>
              )}

              {/* Autor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingBottom: '40px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                marginBottom: '40px', paddingBottom: '40px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }} itemProp="author" itemScope itemType="https://schema.org/Person">
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: 'var(--c-lime)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--c-black)', fontWeight: 800, fontSize: '13px', fontFamily: 'var(--f-sub)',
                  color: 'var(--c-black)', fontWeight: 800, fontSize: '13px', fontFamily: 'var(--f-sub)', flexShrink: 0,
                }}>{post.author.charAt(0).toUpperCase()}</div>
                <span style={{ color: 'var(--c-text-muted)', fontSize: '14px', fontFamily: 'var(--f-sub)' }}>
                <span itemProp="name" style={{ color: 'var(--c-text-muted)', fontSize: '14px', fontFamily: 'var(--f-sub)' }}>
                  {post.author}
                </span>
              </div>

              {/* HTML del artículo */}
              <div dangerouslySetInnerHTML={{ __html: html }} />
              {/* Contenido HTML del articulo */}
              <div itemProp="articleBody" dangerouslySetInnerHTML={{ __html: html }} />

              {/* Tags */}
              {post.tags.length > 0 && (
                <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)', marginBottom: '12px' }}>
                    Etiquetas
              {/* ── PRODUCTOS REALES DE SUPABASE ── */}
              {products.length > 0 && (
                <section aria-label="Productos recomendados" style={{
                  marginTop: '56px',
                  padding: '32px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, rgba(196,252,21,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                  border: '1px solid rgba(196,252,21,0.18)',
                }}>
                  <div style={{ marginBottom: '24px' }}>
                    <p style={{
                      fontFamily: 'var(--f-sub)', fontSize: '10px', fontWeight: 700,
                      letterSpacing: '0.25em', textTransform: 'uppercase',
                      color: 'var(--c-lime)', marginBottom: '8px',
                    }}>
                      Productos mencionados
                    </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {post.tags.map(tag => (
                      <span key={tag} className="badge badge-dark">#{tag}</span>
                    ))}
                    <h2 style={{
                      fontFamily: 'var(--f-heading)', fontSize: 'clamp(18px, 2.5vw, 24px)',
                      color: 'var(--c-white)', margin: 0, lineHeight: 1.1,
                    }}>
                      Encuentra lo que necesitas en Divina Store
                    </h2>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(products.length, 4)}, 1fr)`,
                    gap: '16px',
                  }}>
                    {products.map(p => <ProductCard key={p.id} product={p} />)}
                  </div>

                  <div style={{ textAlign: 'center', marginTop: '24px' }}>
                    <Link to="/catalogo" className="btn btn-outline" style={{ fontSize: '11px', letterSpacing: '0.12em' }}>
                      Ver catálogo completo
                    </Link>
                  </div>
                </section>
              )}

              {/* CTA Productos */}
              {/* CTA generico de respaldo si no hay productos */}
              {products.length === 0 && (
                <div style={{
                  marginTop: '48px', borderRadius: '16px',
                  background: 'var(--c-surface-2)', border: '1px solid rgba(196,252,21,0.2)',
@ -179,11 +401,29 @@ export function BlogPostPage() {
                    Ver catálogo
                  </Link>
                </div>
              )}

              {/* Tags */}
              {post.tags && post.tags.length > 0 && (
                <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
                    color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)', marginBottom: '12px',
                  }}>
                    Etiquetas
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {post.tags.map(tag => (
                      <span key={tag} className="badge badge-dark">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Artículos relacionados */}
              {/* Articulos relacionados */}
              {related.length > 0 && (
                <div style={{ marginTop: '64px' }}>
                  <h3 style={{ fontFamily: 'var(--f-heading)', fontSize: '20px', marginBottom: '24px' }}>
                  <h3 style={{ fontFamily: 'var(--f-heading)', fontSize: '20px', marginBottom: '24px', color: 'var(--c-white)' }}>
                    También te puede <span style={{ color: 'var(--c-lime)' }}>interesar</span>
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
@ -194,17 +434,23 @@ export function BlogPostPage() {
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: 'var(--c-surface-2)',
                        transition: 'border-color 0.2s',
                        textDecoration: 'none',
                      }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-lime)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'}
                      >
                        <img src={r.cover_image || FALLBACK_IMG} alt={r.title}
                          style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                          style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                          loading="lazy"
                        />
                        <div>
                          <p style={{ fontFamily: 'var(--f-sub)', fontSize: '13px', fontWeight: 600, color: 'var(--c-white)', lineHeight: 1.3, marginBottom: '4px' }}>
                            {r.title}
                          </p>
                          <span style={{ color: 'var(--c-lime)', fontSize: '11px', fontFamily: 'var(--f-sub)', fontWeight: 700 }}>LEER →</span>
                          <p style={{
                            fontFamily: 'var(--f-sub)', fontSize: '13px', fontWeight: 600,
                            color: 'var(--c-white)', lineHeight: 1.3, marginBottom: '4px',
                          }}>{r.title}</p>
                          <span style={{ color: 'var(--c-lime)', fontSize: '11px', fontFamily: 'var(--f-sub)', fontWeight: 700 }}>
                            LEER →
                          </span>
                        </div>
                      </Link>
                    ))}
export function BlogPostPage() {
                </Link>
              </div>
            </article>
            <div /> {/* spacer derecho */}
            <div />
          </div>
        </div>
      </div>
