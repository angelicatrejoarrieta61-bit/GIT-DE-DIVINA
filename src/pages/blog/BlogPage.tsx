/**
 * BlogPage.tsx — Listado del blog
 * Diseño: oscuro, premium, consistente con Divina Store MX
 * Usa el design system de index.css (variables CSS, clases utilitarias)
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBlogPosts, type BlogPost } from '../../lib/blog-queries';
import { Seo } from '../../components/Seo';

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=80';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  'Cuidado de Piel': '--c-lime',
  'Rutinas':         '--c-gold',
  'Ingredientes':    '--c-lime',
  'Consejos':        '--c-gold',
};

function PostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  const accentVar = CATEGORY_COLORS[post.category] ?? '--c-lime';

  if (featured) {
    return (
      <Link to={`/blog/${post.slug}`} style={{
        display: 'block',
        gridColumn: 'span 2',
        borderRadius: '20px',
        overflow: 'hidden',
        position: 'relative',
        minHeight: '420px',
        border: '1px solid rgba(255,255,255,0.08)',
        transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1), box-shadow 0.4s',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 30px 60px rgba(0,0,0,0.5)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        }}
      >
        <img src={post.cover_image || FALLBACK_IMG} alt={post.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
        }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '36px' }}>
          <span style={{
            display: 'inline-block', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: 'var(--c-black)', background: `var(${accentVar})`,
            padding: '4px 12px', borderRadius: '100px', marginBottom: '14px',
            fontFamily: 'var(--f-sub)',
          }}>{post.category}</span>
          <h2 style={{
            fontFamily: 'var(--f-heading)', fontSize: 'clamp(22px, 3vw, 32px)',
            lineHeight: 1.1, color: 'var(--c-white)', marginBottom: '12px',
          }}>{post.title}</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px', maxWidth: '600px' }}>
            {post.excerpt}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontFamily: 'var(--f-sub)' }}>
              {formatDate(post.created_at)}
            </span>
            <span style={{ color: `var(${accentVar})`, fontSize: '12px', fontWeight: 700, fontFamily: 'var(--f-sub)', letterSpacing: '0.1em' }}>
              LEER ARTÍCULO →
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/blog/${post.slug}`} style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--c-surface-2)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px', overflow: 'hidden',
      transition: 'transform 0.3s var(--ease-out), border-color 0.3s',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
        (e.currentTarget as HTMLElement).style.borderColor = `var(${accentVar})`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
      }}
    >
      <div style={{ height: '200px', overflow: 'hidden', position: 'relative' }}>
        <img src={post.cover_image || FALLBACK_IMG} alt={post.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s var(--ease-out)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
        />
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <span style={{
          alignSelf: 'flex-start', fontSize: '9px', fontWeight: 700,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--c-black)', background: `var(${accentVar})`,
          padding: '3px 10px', borderRadius: '100px', marginBottom: '12px',
          fontFamily: 'var(--f-sub)',
        }}>{post.category}</span>
        <h3 style={{
          fontFamily: 'var(--f-heading)', fontSize: '16px', lineHeight: 1.2,
          color: 'var(--c-white)', marginBottom: '10px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{post.title}</h3>
        <p style={{
          color: 'var(--c-text-muted)', fontSize: '13px', lineHeight: 1.6, flex: 1,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{post.excerpt}</p>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '16px', paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontFamily: 'var(--f-sub)' }}>
            {formatDate(post.created_at)}
          </span>
          <span style={{ color: `var(${accentVar})`, fontSize: '11px', fontWeight: 700, fontFamily: 'var(--f-sub)', letterSpacing: '0.1em' }}>
            LEER →
          </span>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={{ borderRadius: '16px', overflow: 'hidden', background: 'var(--c-surface-2)' }}>
      <div className="skeleton" style={{ height: '200px' }} />
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="skeleton" style={{ height: '12px', width: '30%' }} />
        <div className="skeleton" style={{ height: '18px', width: '80%' }} />
        <div className="skeleton" style={{ height: '12px', width: '100%' }} />
        <div className="skeleton" style={{ height: '12px', width: '65%' }} />
      </div>
    </div>
  );
}

export function BlogPage() {
  const [posts, setPosts]     = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('Todos');

  const categories = ['Todos', 'Cuidado de Piel', 'Rutinas', 'Ingredientes', 'Consejos'];

  useEffect(() => {
    getBlogPosts(30).then(data => { setPosts(data); setLoading(false); });
  }, []);

  const filtered = filter === 'Todos' ? posts : posts.filter(p => p.category === filter);
  const [featured, ...rest] = filtered;

  return (
    <div style={{ background: 'var(--c-bg)', minHeight: '100vh' }}>
      <Seo
        title="Blog de skincare y bienestar urbano — Divina Store MX"
        description="Guías de skincare, rutinas e ingredientes para cuidar tu piel frente a la contaminación y el clima de la Ciudad de México."
        path="/blog"
      />

      {/* ── Hero ── */}
      <section style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBlock: '60px 48px' }}>
        <div className="page-width">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--c-lime)', display: 'inline-block', animation: 'pulse-lime 2s infinite' }} />
            <span style={{ fontFamily: 'var(--f-sub)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--c-lime)' }}>
              Blog de Bienestar Urbano
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 'clamp(32px, 5vw, 56px)', lineHeight: 1, marginBottom: '16px' }}>
            Cuida tu piel en la <span style={{ color: 'var(--c-lime)' }}>Ciudad de México</span>
          </h1>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '16px', lineHeight: 1.7, maxWidth: '560px' }}>
            Guías, rutinas e ingredientes activos para proteger tu piel de la contaminación, el ozono y las partículas PM2.5 del aire capitalino.
          </p>
        </div>
      </section>

      {/* ── Filtros ── */}
      <section style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 'var(--nav-h)', zIndex: 30, background: 'var(--c-bg)' }}>
        <div className="page-width">
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '14px 0', scrollbarWidth: 'none' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilter(cat)} style={{
                whiteSpace: 'nowrap', fontSize: '11px', fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                fontFamily: 'var(--f-sub)',
                padding: '8px 18px', borderRadius: '100px',
                border: filter === cat ? 'none' : '1px solid rgba(255,255,255,0.15)',
                background: filter === cat ? 'var(--c-lime)' : 'transparent',
                color: filter === cat ? 'var(--c-black)' : 'var(--c-text-muted)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Grid ── */}
      <section className="section" style={{ paddingBlock: '48px' }}>
        <div className="page-width">
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--c-text-muted)' }}>
              <p style={{ fontSize: '16px' }}>No hay artículos en esta categoría aún.</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '20px',
            }}>
              {featured && <PostCard post={featured} featured />}
              {rest.map(post => <PostCard key={post.id} post={post} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
