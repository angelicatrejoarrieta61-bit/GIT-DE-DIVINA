/**
 * AdminBlog.tsx — Gestor de Blog con IA
 * Funciones:
 * - Historial de posts en sidebar izquierdo
 * - Generación de contenido con IA (Claude API)
 * - Búsqueda web real para fuentes y datos
 * - Imágenes distintas por artículo (Unsplash)
 * - Pregunta tema/producto antes de generar
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  getAdminBlogPosts,
  createBlogPost,
  deleteBlogPost,
  toggleBlogPostPublished,
  type BlogPost,
} from '../../lib/blog-queries';

// ─── Unsplash queries por categoría ──────────────────────────
const UNSPLASH_QUERIES: Record<string, string> = {
  'Cuidado de Piel': 'skincare serum face cream luxury',
  'Rutinas':         'morning skincare routine beauty',
  'Ingredientes':    'cosmetic ingredients vitamin c niacinamide',
  'Consejos':        'skin beauty wellness face glow',
  'Marketing':       'beauty product cosmetic luxury brand',
};

// Genera URL de imagen Unsplash única por slug
function getUnsplashUrl(category: string, seed: string): string {
  const query = UNSPLASH_QUERIES[category] ?? 'skincare beauty';
  const encoded = encodeURIComponent(query);
  // Usamos el seed del slug para que cada artículo tenga imagen diferente
  const seedNum = seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `https://source.unsplash.com/800x500/?${encoded}&sig=${seedNum}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Categorías disponibles ───────────────────────────────────
const CATEGORIES = ['Cuidado de Piel', 'Rutinas', 'Ingredientes', 'Consejos', 'Marketing'];

// ─── Modal de confirmación de generación ─────────────────────
interface GenerateModalProps {
  onConfirm: (topic: string, product: string, category: string) => void;
  onClose: () => void;
}

function GenerateModal({ onConfirm, onClose }: GenerateModalProps) {
  const [topic,    setTopic]    = useState('');
  const [product,  setProduct]  = useState('');
  const [category, setCategory] = useState('Cuidado de Piel');

  const handleSubmit = () => {
    if (!topic.trim()) return;
    onConfirm(topic.trim(), product.trim(), category);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#0f0f0f', border: '1px solid rgba(196,252,21,0.3)',
        borderRadius: '20px', padding: '36px', width: '100%', maxWidth: '520px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'rgba(196,252,21,0.1)', border: '1px solid rgba(196,252,21,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
          }}>✨</div>
          <div>
            <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: '20px', margin: 0 }}>Generar nuevo artículo</h2>
            <p style={{ color: 'var(--c-text-muted)', fontSize: '13px', margin: 0 }}>Con IA + búsqueda web real</p>
          </div>
        </div>

        {/* Tema */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--c-text-muted)', marginBottom: '8px', fontFamily: 'var(--f-sub)' }}>
            Tema del artículo *
          </label>
          <input
            className="input-dark"
            placeholder="Ej: Daño oxidativo por contaminación CDMX, SPF en piel mixta..."
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </div>

        {/* Producto */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--c-text-muted)', marginBottom: '8px', fontFamily: 'var(--f-sub)' }}>
            Producto a destacar (opcional)
          </label>
          <input
            className="input-dark"
            placeholder="Ej: ISDIN Eryfotona Actinica SPF 50+, La Roche-Posay Toleriane..."
            value={product}
            onChange={e => setProduct(e.target.value)}
          />
        </div>

        {/* Categoría */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--c-text-muted)', marginBottom: '8px', fontFamily: 'var(--f-sub)' }}>
            Categoría
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                padding: '7px 14px', borderRadius: '100px', fontSize: '12px',
                fontFamily: 'var(--f-sub)', fontWeight: 600, cursor: 'pointer',
                border: category === cat ? 'none' : '1px solid rgba(255,255,255,0.15)',
                background: category === cat ? 'var(--c-lime)' : 'transparent',
                color: category === cat ? '#000' : 'var(--c-text-muted)',
                transition: 'all 0.2s',
              }}>{cat}</button>
            ))}
          </div>
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} className="btn btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!topic.trim()}
            className="btn btn-lime"
            style={{ flex: 2, justifyContent: 'center', fontSize: '12px', opacity: topic.trim() ? 1 : 0.5 }}
          >
            ✨ Generar artículo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────
export function AdminBlog() {
  const [posts,         setPosts]         = useState<BlogPost[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [generating,    setGenerating]    = useState(false);
  const [generateStep,  setGenerateStep]  = useState('');
  const [showModal,     setShowModal]     = useState(false);
  const [selectedPost,  setSelectedPost]  = useState<BlogPost | null>(null);
  const [error,         setError]         = useState('');
  const [successMsg,    setSuccessMsg]    = useState('');

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const data = await getAdminBlogPosts();
    setPosts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // ── Genera artículo con Claude API + imágenes Unsplash ──────
  const handleGenerate = async (topic: string, product: string, category: string) => {
    setShowModal(false);
    setGenerating(true);
    setError('');
    setGenerateStep('🔍 Buscando información y fuentes...');

    try {
      // Prompt con instrucciones de búsqueda web y SEO
      const productLine = product
        ? `\nProducto a destacar en marketing: ${product} (disponible en divinastore.com.mx)`
        : '';

      const prompt = `Eres un redactor SEO senior especializado en dermocosméticos para el mercado mexicano.
Tienda: Divina Store MX (divinastore.com.mx) — dermocosméticos premium en CDMX.
Marcas: ISDIN, La Roche-Posay, Vichy, CeraVe, Paula's Choice.

TEMA: ${topic}${productLine}
CATEGORÍA: ${category}

INSTRUCCIONES:
1. Investiga y usa datos reales, estudios científicos y estadísticas actuales sobre el tema.
2. Menciona específicamente la contaminación en CDMX y cómo afecta la piel.
3. Incluye al menos 3 ingredientes activos con evidencia científica.
4. Si hay producto, intégralo naturalmente con precio estimado en MXN y link interno.
5. El contenido debe tener mínimo 800 palabras en HTML limpio (solo h2, h3, p, ul, li, strong).
6. Tono: experto pero accesible, español mexicano natural.
7. SEO: incluye keyword principal en título, primer párrafo y subtítulos.

Responde ÚNICAMENTE con este JSON válido, sin markdown ni texto extra:
{
  "title": "título SEO de 55-65 caracteres con keyword",
  "slug": "slug-kebab-case-unico",
  "excerpt": "resumen de 150-160 caracteres para meta description",
  "content": "<h2>...</h2><p>...</p> HTML completo del artículo mínimo 800 palabras",
  "category": "${category}",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "author": "Equipo Divina"
}`;

      setGenerateStep('✍️ Generando contenido con IA...');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const rawText = data.content?.[0]?.text ?? '';

      setGenerateStep('📝 Procesando respuesta...');

      // Extraer JSON de la respuesta
      let postData: Record<string, unknown>;
      try {
        postData = JSON.parse(rawText);
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('La IA no devolvió JSON válido');
        postData = JSON.parse(match[0]);
      }

      setGenerateStep('🖼️ Asignando imagen...');

      // Imagen Unsplash única por slug
      const slug = String(postData.slug ?? `post-${Date.now()}`);
      const coverImage = getUnsplashUrl(category, slug);

      setGenerateStep('💾 Guardando en Supabase...');

      const newPost = await createBlogPost({
        slug,
        title:       String(postData.title ?? ''),
        excerpt:     String(postData.excerpt ?? ''),
        content:     String(postData.content ?? ''),
        cover_image: coverImage,
        category:    String(postData.category ?? category),
        tags:        Array.isArray(postData.tags) ? postData.tags as string[] : [],
        author:      String(postData.author ?? 'Equipo Divina'),
        published:   true,
      });

      if (!newPost) throw new Error('Error guardando en base de datos');

      setSuccessMsg(`✅ Artículo "${newPost.title}" creado exitosamente`);
      setTimeout(() => setSuccessMsg(''), 5000);
      await loadPosts();
      setSelectedPost(newPost);

    } catch (err) {
      setError(`❌ Error: ${String(err)}`);
    } finally {
      setGenerating(false);
      setGenerateStep('');
    }
  };

  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`¿Eliminar "${post.title}"?`)) return;
    await deleteBlogPost(post.id);
    if (selectedPost?.id === post.id) setSelectedPost(null);
    await loadPosts();
  };

  const handleTogglePublish = async (post: BlogPost) => {
    await toggleBlogPostPublished(post.id, !post.published);
    await loadPosts();
    if (selectedPost?.id === post.id) {
      setSelectedPost({ ...post, published: !post.published });
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)' }}>

      {/* ── Sidebar izquierdo: historial ── */}
      <aside style={{
        width: '280px', flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden',
      }}>
        {/* Header sidebar */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: '16px', margin: 0 }}>Blog</h2>
              <p style={{ color: 'var(--c-text-muted)', fontSize: '11px', margin: 0 }}>
                {posts.length} artículo{posts.length !== 1 ? 's' : ''}
              </p>
            </div>
            <span style={{
              background: 'rgba(196,252,21,0.15)', color: 'var(--c-lime)',
              fontSize: '10px', fontWeight: 700, padding: '3px 8px',
              borderRadius: '100px', fontFamily: 'var(--f-sub)', letterSpacing: '0.1em',
            }}>
              {posts.filter(p => p.published).length} live
            </span>
          </div>

          {/* Botón principal */}
          <button
            onClick={() => setShowModal(true)}
            disabled={generating}
            style={{
              width: '100%', padding: '10px 14px',
              background: generating ? 'rgba(196,252,21,0.2)' : 'var(--c-lime)',
              color: generating ? 'var(--c-lime)' : '#000',
              border: generating ? '1px solid rgba(196,252,21,0.4)' : 'none',
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              fontFamily: 'var(--f-sub)', letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {generating ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                Generando...
              </>
            ) : (
              <> ✨ Crear nuevo contenido </>
            )}
          </button>
        </div>

        {/* Lista de posts */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '64px', borderRadius: '10px', margin: '4px 0' }} />
            ))
          ) : posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--c-text-muted)', fontSize: '13px' }}>
              No hay artículos aún
            </div>
          ) : (
            posts.map(post => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                style={{
                  padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                  background: selectedPost?.id === post.id ? 'rgba(196,252,21,0.08)' : 'transparent',
                  border: selectedPost?.id === post.id ? '1px solid rgba(196,252,21,0.2)' : '1px solid transparent',
                  marginBottom: '4px', transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (selectedPost?.id !== post.id)
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={e => {
                  if (selectedPost?.id !== post.id)
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{
                    flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%',
                    background: post.published ? 'var(--c-lime)' : 'rgba(255,255,255,0.2)',
                    marginTop: '6px',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontSize: '12px', fontWeight: 600, color: 'var(--c-white)',
                      margin: 0, lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>{post.title}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em',
                        color: '#000', background: 'var(--c-lime)',
                        padding: '1px 6px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
                      }}>{post.category}</span>
                      <span style={{ fontSize: '10px', color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)' }}>
                        {formatDate(post.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Área principal ── */}
      <main style={{ flex: 1, overflow: 'auto', padding: '0' }}>

        {/* Generando... overlay */}
        {generating && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'rgba(196,252,21,0.05)',
            borderBottom: '1px solid rgba(196,252,21,0.2)',
            padding: '12px 24px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <div style={{
              width: '16px', height: '16px', border: '2px solid var(--c-lime)',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
            <span style={{ fontSize: '13px', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)', fontWeight: 600 }}>
              {generateStep}
            </span>
          </div>
        )}

        {/* Mensajes */}
        {successMsg && (
          <div style={{ margin: '16px 24px 0', padding: '12px 16px', background: 'rgba(196,252,21,0.1)', border: '1px solid rgba(196,252,21,0.3)', borderRadius: '10px', fontSize: '13px', color: 'var(--c-lime)' }}>
            {successMsg}
          </div>
        )}
        {error && (
          <div style={{ margin: '16px 24px 0', padding: '12px 16px', background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.3)', borderRadius: '10px', fontSize: '13px', color: '#ff9090' }}>
            {error}
          </div>
        )}

        {/* Sin artículo seleccionado */}
        {!selectedPost && !generating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--c-text-muted)', textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✍️</div>
            <h3 style={{ fontFamily: 'var(--f-heading)', fontSize: '22px', color: 'var(--c-white)', marginBottom: '8px' }}>
              Gestor de Blog con IA
            </h3>
            <p style={{ fontSize: '14px', maxWidth: '360px', lineHeight: 1.6 }}>
              Selecciona un artículo del historial o genera nuevo contenido con búsqueda web real e imágenes únicas.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="btn btn-lime"
              style={{ marginTop: '24px', fontSize: '12px' }}
            >
              ✨ Crear primer artículo
            </button>
          </div>
        )}

        {/* Vista del artículo seleccionado */}
        {selectedPost && !generating && (
          <div style={{ maxWidth: '820px', margin: '0 auto', padding: '32px 24px' }}>

            {/* Acciones */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <a
                href={`/blog/${selectedPost.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
                style={{ fontSize: '11px', padding: '8px 16px' }}
              >
                👁️ Ver en sitio
              </a>
              <button
                onClick={() => handleTogglePublish(selectedPost)}
                className="btn"
                style={{
                  fontSize: '11px', padding: '8px 16px',
                  background: selectedPost.published ? 'rgba(255,100,100,0.15)' : 'rgba(196,252,21,0.15)',
                  color: selectedPost.published ? '#ff9090' : 'var(--c-lime)',
                  border: `1px solid ${selectedPost.published ? 'rgba(255,100,100,0.3)' : 'rgba(196,252,21,0.3)'}`,
                }}
              >
                {selectedPost.published ? '⏸ Despublicar' : '▶ Publicar'}
              </button>
              <button
                onClick={() => handleDelete(selectedPost)}
                className="btn"
                style={{ fontSize: '11px', padding: '8px 16px', background: 'rgba(255,100,100,0.1)', color: '#ff9090', border: '1px solid rgba(255,100,100,0.2)', marginLeft: 'auto' }}
              >
                🗑 Eliminar
              </button>
            </div>

            {/* Imagen */}
            {selectedPost.cover_image && (
              <div style={{ borderRadius: '16px', overflow: 'hidden', marginBottom: '24px', height: '260px' }}>
                <img src={selectedPost.cover_image} alt={selectedPost.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            {/* Meta */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: '#000', background: 'var(--c-lime)', padding: '3px 10px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
              }}>{selectedPost.category}</span>
              <span style={{ color: 'var(--c-text-muted)', fontSize: '12px', fontFamily: 'var(--f-sub)' }}>
                {formatDate(selectedPost.created_at)}
              </span>
              <span style={{
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em',
                padding: '3px 10px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
                background: selectedPost.published ? 'rgba(196,252,21,0.15)' : 'rgba(255,255,255,0.08)',
                color: selectedPost.published ? 'var(--c-lime)' : 'var(--c-text-muted)',
                border: `1px solid ${selectedPost.published ? 'rgba(196,252,21,0.3)' : 'rgba(255,255,255,0.1)'}`,
              }}>
                {selectedPost.published ? '● PUBLICADO' : '○ BORRADOR'}
              </span>
            </div>

            {/* Título */}
            <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 'clamp(22px,3vw,32px)', lineHeight: 1.1, marginBottom: '16px' }}>
              {selectedPost.title}
            </h1>

            {/* Excerpt */}
            <p style={{ color: 'var(--c-text-muted)', fontSize: '15px', lineHeight: 1.6, marginBottom: '24px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid var(--c-lime)', borderRadius: '0 8px 8px 0' }}>
              {selectedPost.excerpt}
            </p>

            {/* Tags */}
            {selectedPost.tags?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '24px' }}>
                {selectedPost.tags.map(tag => (
                  <span key={tag} className="badge badge-dark">#{tag}</span>
                ))}
              </div>
            )}

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', marginBottom: '24px' }} />

            {/* Contenido HTML */}
            <div
              style={{ color: 'rgba(255,255,255,0.75)', fontSize: '15px', lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{
                __html: selectedPost.content
                  .replace(/<h2/g, '<h2 style="font-family:var(--f-heading);font-size:20px;color:var(--c-white);margin:32px 0 12px;"')
                  .replace(/<h3/g, '<h3 style="font-family:var(--f-sub);font-size:17px;font-weight:700;color:var(--c-white);margin:24px 0 10px;"')
                  .replace(/<p>/g, '<p style="margin-bottom:16px;">')
                  .replace(/<ul>/g, '<ul style="padding-left:20px;list-style:disc;margin-bottom:16px;">')
                  .replace(/<li>/g, '<li style="margin-bottom:8px;">')
              }}
            />
          </div>
        )}
      </main>

      {/* Modal de generación */}
      {showModal && (
        <GenerateModal
          onConfirm={handleGenerate}
          onClose={() => setShowModal(false)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
