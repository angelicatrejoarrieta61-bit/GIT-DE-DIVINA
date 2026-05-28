/**
 * BlogPostPage.tsx — Vista individual de artículo
 * Diseño premium oscuro consistente con Divina Store MX
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getBlogPostBySlug, getRelatedPosts, type BlogPost } from '../../lib/blog-queries';

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1200&q=80';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function injectHeadingIds(html: string): string {
  let i = 0;
  return html.replace(/<h2([^>]*)>/gi, () => `<h2 id="heading-${i++}" style="font-family:var(--f-heading);font-size:clamp(18px,2.5vw,24px);color:var(--c-white);margin:48px 0 16px;line-height:1.2;">`);
}

function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const handler = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? (el.scrollTop / total) * 100 : 0);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: '2px', background: 'rgba(255,255,255,0.08)' }}>
      <div style={{ height: '100%', background: 'var(--c-lime)', width: `${progress}%`, transition: 'width 0.1s linear' }} />
    </div>
  );
}

export function BlogPostPage() {
  const { slug }    = useParams<{ slug: string }>();
  const navigate    = useNavigate();
  const [post, setPost]     = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    window.scrollTo(0, 0);
    getBlogPostBySlug(slug).then(data => {
      if (!data) { navigate('/blog', { replace: true }); return; }
      setPost(data);
      getRelatedPosts(data.category, slug, 3).then(setRelated);
      setLoading(false);
    });
  }, [slug, navigate]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '32px', height: '32px', border: '2px solid var(--c-lime)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!post) return null;

  const mins = readingTime(post.content);
  const html = injectHeadingIds(post.content)
    .replace(/<h3([^>]*)>/gi, '<h3 style="font-family:var(--f-sub);font-size:18px;font-weight:700;color:var(--c-white);margin:32px 0 12px;">')
    .replace(/<p>/gi, '<p style="color:rgba(255,255,255,0.72);font-size:16px;line-height:1.8;margin-bottom:20px;">')
    .replace(/<ul>/gi, '<ul style="color:rgba(255,255,255,0.72);font-size:16px;line-height:1.8;margin-bottom:20px;padding-left:20px;list-style:disc;">')
    .replace(/<li>/gi, '<li style="margin-bottom:8px;">');

  return (
    <>
      <ReadingProgress />
      <div style={{ background: 'var(--c-bg)', minHeight: '100vh' }}>

        {/* ── Hero imagen ── */}
        <div style={{ position: 'relative', height: 'clamp(260px, 45vw, 480px)', overflow: 'hidden' }}>
          <img src={post.cover_image || FALLBACK_IMG} alt={post.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.85) 100%)' }} />
          {/* Breadcrumb encima */}
          <div style={{ position: 'absolute', top: '24px', left: 0, right: 0 }}>
            <div className="page-width">
              <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--f-sub)' }}>
                <Link to="/" style={{ color: 'rgba(255,255,255,0.5)', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-lime)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}>Inicio</Link>
                <span>/</span>
                <Link to="/blog" style={{ color: 'rgba(255,255,255,0.5)', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-lime)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}>Blog</Link>
                <span>/</span>
                <span style={{ color: 'rgba(255,255,255,0.8)' }}>{post.category}</span>
              </nav>
            </div>
          </div>
        </div>

        {/* ── Contenido ── */}
        <div className="page-width" style={{ paddingBlock: '48px 80px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr min(680px, 100%) 1fr', gap: '0 32px' }}>
            <div /> {/* spacer izquierdo */}
            <article>
              {/* Meta */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'var(--c-black)', background: 'var(--c-lime)',
                  padding: '4px 12px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
                }}>{post.category}</span>
                <time style={{ color: 'var(--c-text-muted)', fontSize: '13px', fontFamily: 'var(--f-sub)' }}>
                  {formatDate(post.created_at)}
                </time>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span style={{ color: 'var(--c-text-muted)', fontSize: '13px', fontFamily: 'var(--f-sub)' }}>
                  {mins} min de lectura
                </span>
              </div>

              {/* Título */}
              <h1 style={{
                fontFamily: 'var(--f-heading)',
                fontSize: 'clamp(26px, 4vw, 42px)',
                lineHeight: 1.05, color: 'var(--c-white)', marginBottom: '24px',
              }}>{post.title}</h1>

              {/* Autor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingBottom: '40px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: 'var(--c-lime)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--c-black)', fontWeight: 800, fontSize: '13px', fontFamily: 'var(--f-sub)',
                }}>{post.author.charAt(0).toUpperCase()}</div>
                <span style={{ color: 'var(--c-text-muted)', fontSize: '14px', fontFamily: 'var(--f-sub)' }}>
                  {post.author}
                </span>
              </div>

              {/* HTML del artículo */}
              <div dangerouslySetInnerHTML={{ __html: html }} />

              {/* Tags */}
              {post.tags.length > 0 && (
                <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)', marginBottom: '12px' }}>
                    Etiquetas
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {post.tags.map(tag => (
                      <span key={tag} className="badge badge-dark">#{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA Productos */}
              <div style={{
                marginTop: '48px', borderRadius: '16px',
                background: 'var(--c-surface-2)', border: '1px solid rgba(196,252,21,0.2)',
                padding: '28px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px',
              }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <p style={{ fontFamily: 'var(--f-heading)', fontSize: '18px', color: 'var(--c-white)', marginBottom: '6px' }}>
                    Encuentra los productos que necesitas
                  </p>
                  <p style={{ color: 'var(--c-text-muted)', fontSize: '13px' }}>
                    Catálogo seleccionado para vivir en CDMX.
                  </p>
                </div>
                <Link to="/catalogo" className="btn btn-lime" style={{ flexShrink: 0 }}>
                  Ver catálogo
                </Link>
              </div>

              {/* Artículos relacionados */}
              {related.length > 0 && (
                <div style={{ marginTop: '64px' }}>
                  <h3 style={{ fontFamily: 'var(--f-heading)', fontSize: '20px', marginBottom: '24px' }}>
                    También te puede <span style={{ color: 'var(--c-lime)' }}>interesar</span>
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                    {related.map(r => (
                      <Link key={r.id} to={`/blog/${r.slug}`} style={{
                        display: 'flex', gap: '12px', alignItems: 'flex-start',
                        padding: '12px', borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: 'var(--c-surface-2)',
                        transition: 'border-color 0.2s',
                      }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-lime)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'}
                      >
                        <img src={r.cover_image || FALLBACK_IMG} alt={r.title}
                          style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                        <div>
                          <p style={{ fontFamily: 'var(--f-sub)', fontSize: '13px', fontWeight: 600, color: 'var(--c-white)', lineHeight: 1.3, marginBottom: '4px' }}>
                            {r.title}
                          </p>
                          <span style={{ color: 'var(--c-lime)', fontSize: '11px', fontFamily: 'var(--f-sub)', fontWeight: 700 }}>LEER →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Volver */}
              <div style={{ marginTop: '48px' }}>
                <Link to="/blog" className="btn btn-outline" style={{ fontSize: '11px' }}>
                  ← Volver al blog
                </Link>
              </div>
            </article>
            <div /> {/* spacer derecho */}
          </div>
        </div>
      </div>
    </>
  );
}