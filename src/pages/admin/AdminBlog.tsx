/**
 * AdminBlog.tsx — Gestor de Blog con IA
 * Flujo: Seleccionar producto → Generar preview → Ver a la derecha → Aceptar/Publicar
 * Historial: "Últimos Posts" siempre visible en sidebar izquierdo
 */

import React, { useEffect, useState, useCallback } from 'react';
import { supabase, uploadAsset, getImageUrl } from '../../lib/supabase';
import {
  getAdminBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  toggleBlogPostPublished,
  type BlogPost,
} from '../../lib/blog-queries';
import type { Product } from '../../types';

// ─── Tipos ────────────────────────────────────────────────────
interface PreviewPost {
  title:       string;
  slug:        string;
  excerpt:     string;
  content:     string;
  category:    string;
  tags:        string[];
  author:      string;
  cover_image: string;
  published:   boolean;
}

// ─── Helpers ──────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ─── Sub-componente: Renderizador de contenido ─────────────────
function ArticleContent({ html }: { html: string }) {
  const styled = html
    .replace(/<h2/g, '<h2 style="font-family:var(--f-heading);font-size:22px;color:var(--c-white);margin:36px 0 14px;line-height:1.2;"')
    .replace(/<h3/g, '<h3 style="font-family:var(--f-sub);font-size:17px;font-weight:700;color:var(--c-white);margin:28px 0 10px;"')
    .replace(/<p>/g, '<p style="margin-bottom:18px;color:rgba(255,255,255,0.78);line-height:1.8;">')
    .replace(/<ul>/g, '<ul style="padding-left:22px;list-style:disc;margin-bottom:18px;">')
    .replace(/<li>/g, '<li style="margin-bottom:10px;color:rgba(255,255,255,0.78);line-height:1.7;">')
    .replace(/<strong>/g, '<strong style="color:var(--c-white);font-weight:700;">');

  return (
    <div
      style={{ fontSize: '15px' }}
      dangerouslySetInnerHTML={{ __html: styled }}
    />
  );
}

// ─── Sub-componente: Panel de artículo (preview o existente) ────
interface ArticlePanelProps {
  key?:         string | number;
  post:         PreviewPost | BlogPost;
  isPreview?:   boolean;
  publishing?:  boolean;
  onPublish?:   () => void;
  onDiscard?:   () => void;
  onToggle?:    () => void;
  onDelete?:    () => void;
  onUpdateCoverImage?: (newUrl: string) => Promise<void> | void;
}

function ArticlePanel({
  post, isPreview = false, publishing = false,
  onPublish, onDiscard, onToggle, onDelete, onUpdateCoverImage,
}: ArticlePanelProps) {
  const blogPost = post as BlogPost;
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setUploadError('');
    try {
      const fileSlug = post.slug || 'blog-post';
      const path = await uploadAsset(file, fileSlug);
      if (path) {
        const fullUrl = getImageUrl(path);
        if (onUpdateCoverImage) {
          await onUpdateCoverImage(fullUrl);
        }
      } else {
        setUploadError('No se pudo subir la imagen.');
      }
    } catch (err) {
      console.error(err);
      setUploadError('Error al subir la imagen.');
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '32px 28px 60px' }}>

      {/* Barra de acciones */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '28px', flexWrap: 'wrap',
      }}>
        {isPreview ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 14px', borderRadius: '8px',
              background: 'rgba(196,252,21,0.08)', border: '1px solid rgba(196,252,21,0.2)',
              fontSize: '12px', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)', fontWeight: 700,
            }}>
              👁 PREVIEW — revisa antes de publicar
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
              <button
                onClick={onDiscard}
                className="btn btn-outline"
                style={{ fontSize: '12px', padding: '9px 18px' }}
              >
                ✕ Descartar
              </button>
              <button
                onClick={onPublish}
                disabled={publishing}
                className="btn btn-lime"
                style={{ fontSize: '12px', padding: '9px 22px', opacity: publishing ? 0.7 : 1 }}
              >
                {publishing ? '⏳ Publicando...' : '✅ Aceptar y Publicar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <a
              href={`/blog/${blogPost.slug}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
              style={{ fontSize: '11px', padding: '8px 16px' }}
            >
              👁️ Ver en sitio
            </a>
            <button
              onClick={onToggle}
              className="btn"
              style={{
                fontSize: '11px', padding: '8px 16px',
                background: blogPost.published ? 'rgba(255,100,100,0.12)' : 'rgba(196,252,21,0.12)',
                color:      blogPost.published ? '#ff9090' : 'var(--c-lime)',
                border:     `1px solid ${blogPost.published ? 'rgba(255,100,100,0.25)' : 'rgba(196,252,21,0.25)'}`,
              }}
            >
              {blogPost.published ? '⏸ Despublicar' : '▶ Publicar'}
            </button>
            <button
              onClick={onDelete}
              className="btn"
              style={{
                fontSize: '11px', padding: '8px 16px', marginLeft: 'auto',
                background: 'rgba(255,80,80,0.08)', color: '#ff8080',
                border: '1px solid rgba(255,80,80,0.18)',
              }}
            >
              🗑 Eliminar
            </button>
          </>
        )}
      </div>

      {/* Imagen de portada interactiva */}
      <div style={{
        position: 'relative',
        borderRadius: '18px',
        overflow: 'hidden',
        marginBottom: '28px',
        height: '280px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: uploadingImage ? 'not-allowed' : 'pointer',
      }}>
        {post.cover_image ? (
          <img
            src={post.cover_image}
            alt={post.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: uploadingImage ? 'blur(4px) brightness(0.5)' : 'none',
              transition: 'filter 0.3s ease',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '40px' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>📷</span>
            <span style={{ fontFamily: 'var(--f-sub)', fontSize: '13px', fontWeight: 600, color: 'var(--c-lime)' }}>
              Agregar Imagen de Portada
            </span>
            <span style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
              Formatos recomendados: PNG, JPG, WEBP
            </span>
          </div>
        )}

        {/* Overlay de carga */}
        {uploadingImage && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10,10,10,0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              border: '2px solid var(--c-lime)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: '12px', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)', fontWeight: 600 }}>
              Subiendo imagen a Supabase...
            </span>
          </div>
        )}

        {/* Botón/Capa interactiva para disparar input de archivo */}
        {!uploadingImage && (
          <label
            htmlFor="blog-cover-file-input"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: post.cover_image ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.1)',
              transition: 'background 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              if (post.cover_image) {
                e.currentTarget.style.background = 'rgba(0,0,0,0.5)';
                const childBtn = e.currentTarget.querySelector('.hover-btn') as HTMLElement;
                if (childBtn) childBtn.style.opacity = '1';
              }
            }}
            onMouseLeave={e => {
              if (post.cover_image) {
                e.currentTarget.style.background = 'rgba(0,0,0,0)';
                const childBtn = e.currentTarget.querySelector('.hover-btn') as HTMLElement;
                if (childBtn) childBtn.style.opacity = '0';
              }
            }}
          >
            {post.cover_image && (
              <span
                className="hover-btn"
                style={{
                  background: 'rgba(0,0,0,0.75)',
                  color: 'var(--c-white)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '30px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontFamily: 'var(--f-sub)',
                  fontWeight: 600,
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                📷 Cambiar Portada
              </span>
            )}
          </label>
        )}

        {/* Input de archivo real pero oculto */}
        <input
          id="blog-cover-file-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploadingImage}
          style={{ display: 'none' }}
        />
      </div>

      {/* Error de carga si ocurre */}
      {uploadError && (
        <div style={{
          color: '#ff8080',
          background: 'rgba(255,80,80,0.08)',
          border: '1px solid rgba(255,80,80,0.18)',
          borderRadius: '10px',
          padding: '10px 14px',
          fontSize: '12px',
          marginBottom: '20px',
          fontFamily: 'var(--f-sub)',
        }}>
          ⚠️ {uploadError}
        </div>
      )}

      {/* Meta chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
        <span style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: '#000', background: 'var(--c-lime)', padding: '4px 12px', borderRadius: '100px',
          fontFamily: 'var(--f-sub)',
        }}>
          {post.category}
        </span>
        <span style={{ color: 'var(--c-text-muted)', fontSize: '12px', fontFamily: 'var(--f-sub)' }}>
          {'created_at' in post ? formatDate(post.created_at) : new Date().toLocaleDateString('es-MX')}
        </span>
        <span style={{ color: 'var(--c-text-muted)', fontSize: '12px', fontFamily: 'var(--f-sub)' }}>
          · {readingTime(post.content)} min de lectura
        </span>
        {!isPreview && (
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
            padding: '4px 10px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
            background: blogPost.published ? 'rgba(196,252,21,0.12)' : 'rgba(255,255,255,0.06)',
            color:      blogPost.published ? 'var(--c-lime)' : 'var(--c-text-muted)',
            border:     `1px solid ${blogPost.published ? 'rgba(196,252,21,0.25)' : 'rgba(255,255,255,0.08)'}`,
          }}>
            {blogPost.published ? '● PUBLICADO' : '○ BORRADOR'}
          </span>
        )}
        {isPreview && (
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
            padding: '4px 10px', borderRadius: '100px', fontFamily: 'var(--f-sub)',
            background: 'rgba(255,180,0,0.12)', color: '#ffcc44',
            border: '1px solid rgba(255,180,0,0.25)',
          }}>
            ● PREVIEW
          </span>
        )}
      </div>

      {/* Título */}
      <h1 style={{
        fontFamily: 'var(--f-heading)',
        fontSize: 'clamp(24px, 3vw, 34px)',
        lineHeight: 1.1, marginBottom: '18px',
      }}>
        {post.title}
      </h1>

      {/* Excerpt */}
      <p style={{
        color: 'var(--c-text-muted)', fontSize: '15px', lineHeight: 1.7,
        marginBottom: '28px', padding: '16px 20px',
        background: 'rgba(255,255,255,0.03)',
        borderLeft: '3px solid var(--c-lime)',
        borderRadius: '0 10px 10px 0',
        fontStyle: 'italic',
      }}>
        {post.excerpt}
      </p>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '28px' }}>
          {post.tags.map(tag => (
            <span
              key={tag}
              style={{
                fontSize: '11px', padding: '4px 10px', borderRadius: '100px',
                background: 'rgba(255,255,255,0.05)', color: 'var(--c-text-muted)',
                border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'var(--f-sub)',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', marginBottom: '28px' }} />

      {/* Contenido HTML */}
      <ArticleContent html={post.content} />

      {/* Repetir botón publicar al final (preview) */}
      {isPreview && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '40px', paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onDiscard} className="btn btn-outline" style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }}>
            ✕ Descartar
          </button>
          <button
            onClick={onPublish}
            disabled={publishing}
            className="btn btn-lime"
            style={{ flex: 2, justifyContent: 'center', fontSize: '13px', opacity: publishing ? 0.7 : 1 }}
          >
            {publishing ? '⏳ Publicando...' : '✅ Aceptar y Publicar'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────
export function AdminBlog() {
  const [posts,          setPosts]          = useState<BlogPost[]>([]);
  const [products,       setProducts]       = useState<Product[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [loadingPosts,   setLoadingPosts]   = useState(true);
  const [generating,     setGenerating]     = useState(false);
  const [generateStep,   setGenerateStep]   = useState('');
  const [preview,        setPreview]        = useState<PreviewPost | null>(null);
  const [selectedPost,   setSelectedPost]   = useState<BlogPost | null>(null);
  const [publishing,     setPublishing]     = useState(false);
  const [error,          setError]          = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');

  // ── Cargar posts ─────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    const data = await getAdminBlogPosts();
    setPosts(data);
    setLoadingPosts(false);
  }, []);

  // ── Cargar productos ─────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, brand, description, price, image_url, in_stock')
      .order('name');
    setProducts((data ?? []) as Product[]);
  }, []);

  useEffect(() => {
    loadPosts();
    loadProducts();
  }, [loadPosts, loadProducts]);

  // ── Seleccionar producto desde sidebar post ──────────────────
  const handleSelectPost = (post: BlogPost) => {
    setPreview(null);
    setSelectedPost(post);
  };

  // ── Generar preview vía Edge Function ────────────────────────
  const handleGenerate = async () => {
    const prod = products.find(p => p.id === selectedProdId);
    if (!prod) return;

    setGenerating(true);
    setPreview(null);
    setSelectedPost(null);
    setError('');

    const steps = [
      '🔍 Analizando ingredientes activos del producto...',
      '📚 Consultando evidencia científica y estudios clínicos...',
      '✍️  Redactando artículo con tono editorial...',
      '🖼️  Asignando imagen de portada...',
      '✅ Preparando preview...',
    ];

    let stepIdx = 0;
    setGenerateStep(steps[0]);
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setGenerateStep(steps[stepIdx]);
    }, 3500);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'generate-blog-post',
        {
          body: {
            preview: true,
            product: {
              name:        prod.name,
              brand:       prod.brand ?? '',
              description: prod.description ?? '',
              price:       String(prod.price ?? ''),
              image_url:   prod.image_url ?? '',
            },
          },
        }
      );

      if (fnError) throw new Error(String(fnError.message ?? fnError));
      if (!data?.success) throw new Error(data?.error ?? 'Error desconocido');

      setPreview(data.post as PreviewPost);
    } catch (err) {
      setError(`❌ Error al generar: ${String(err)}`);
    } finally {
      clearInterval(stepTimer);
      setGenerating(false);
      setGenerateStep('');
    }
  };

  // ── Publicar preview → guardar en Supabase ───────────────────
  const handlePublish = async () => {
    if (!preview) return;
    setPublishing(true);
    setError('');

    try {
      const saved = await createBlogPost({
        title:       preview.title,
        slug:        preview.slug,
        excerpt:     preview.excerpt,
        content:     preview.content,
        cover_image: preview.cover_image,
        category:    preview.category,
        tags:        preview.tags,
        author:      preview.author,
        published:   true,
      });

      if (!saved) throw new Error('Error al guardar en base de datos');

      setSuccessMsg(`✅ "${saved.title}" publicado correctamente`);
      setTimeout(() => setSuccessMsg(''), 5000);

      setPreview(null);
      setSelectedPost(saved);
      await loadPosts();
    } catch (err) {
      setError(`❌ ${String(err)}`);
    } finally {
      setPublishing(false);
    }
  };

  // ── Toggle publicado/borrador ─────────────────────────────────
  const handleToggle = async (post: BlogPost) => {
    await toggleBlogPostPublished(post.id, !post.published);
    await loadPosts();
    setSelectedPost(prev => prev?.id === post.id ? { ...post, published: !post.published } : prev);
  };

  // ── Eliminar post ─────────────────────────────────────────────
  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`¿Eliminar "${post.title}"?`)) return;
    await deleteBlogPost(post.id);
    if (selectedPost?.id === post.id) setSelectedPost(null);
    await loadPosts();
  };

  // ── Actualizar imagen de portada de post existente ───────────
  const handleUpdateCoverImage = async (postId: string, newUrl: string) => {
    try {
      const success = await updateBlogPost(postId, { cover_image: newUrl });
      if (!success) throw new Error('Error al actualizar en la base de datos');
      
      setSuccessMsg('✅ Imagen de portada actualizada correctamente');
      setTimeout(() => setSuccessMsg(''), 5000);
      
      setSelectedPost(prev => prev?.id === postId ? { ...prev, cover_image: newUrl } : prev);
      await loadPosts();
    } catch (err) {
      setError(`❌ Error al actualizar portada: ${String(err)}`);
    }
  };

  // ── Actualizar imagen de portada del preview temporal ────────
  const handleUpdatePreviewCover = (newUrl: string) => {
    setPreview(prev => prev ? { ...prev, cover_image: newUrl } : null);
  };

  const selectedProduct = products.find(p => p.id === selectedProdId);

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)' }}>

      {/* ══ SIDEBAR IZQUIERDO ═══════════════════════════════════ */}
      <aside style={{
        width: '300px', flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: '18px', margin: 0 }}>✍️ Blog con IA</h2>
            <span style={{
              background: 'rgba(196,252,21,0.12)', color: 'var(--c-lime)',
              fontSize: '10px', fontWeight: 700, padding: '3px 9px',
              borderRadius: '100px', fontFamily: 'var(--f-sub)',
            }}>
              {posts.filter(p => p.published).length} live
            </span>
          </div>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '11px', margin: 0 }}>
            {posts.length} artículo{posts.length !== 1 ? 's' : ''} en total
          </p>
        </div>

        {/* ── Selector de producto + botón generar ── */}
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <label style={{
            display: 'block', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.15em', textTransform: 'uppercase',
            color: 'var(--c-text-muted)', marginBottom: '8px', fontFamily: 'var(--f-sub)',
          }}>
            Selecciona un producto
          </label>

          <select
            value={selectedProdId}
            onChange={e => setSelectedProdId(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px', color: 'var(--c-white)',
              fontSize: '12px', fontFamily: 'var(--f-body)',
              cursor: 'pointer', marginBottom: '10px',
              outline: 'none', appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23888\' fill=\'none\' stroke-width=\'1.5\'/%3E%3C/svg%3E")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '32px',
            }}
          >
            <option value="" style={{ background: '#111' }}>— Elige un producto —</option>
            {products.map(p => (
              <option key={p.id} value={p.id} style={{ background: '#111' }}>
                {p.name}{p.brand ? ` · ${p.brand}` : ''}
              </option>
            ))}
          </select>

          {/* Info del producto seleccionado */}
          {selectedProduct && (
            <div style={{
              padding: '10px 12px', borderRadius: '8px',
              background: 'rgba(196,252,21,0.05)',
              border: '1px solid rgba(196,252,21,0.12)',
              marginBottom: '10px',
            }}>
              <p style={{ fontSize: '11px', color: 'var(--c-lime)', margin: '0 0 2px', fontWeight: 700, fontFamily: 'var(--f-sub)' }}>
                {selectedProduct.brand ?? 'Sin marca'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--c-white)', margin: '0 0 4px', lineHeight: 1.3 }}>
                {selectedProduct.name}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--c-text-muted)', margin: 0, fontFamily: 'var(--f-sub)' }}>
                ${selectedProduct.price} MXN
              </p>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!selectedProdId || generating}
            style={{
              width: '100%', padding: '11px 14px',
              background: !selectedProdId || generating
                ? 'rgba(196,252,21,0.15)'
                : 'var(--c-lime)',
              color: !selectedProdId || generating ? 'var(--c-lime)' : '#000',
              border: !selectedProdId || generating
                ? '1px solid rgba(196,252,21,0.3)'
                : 'none',
              borderRadius: '10px', fontSize: '12px', fontWeight: 700,
              fontFamily: 'var(--f-sub)', letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: !selectedProdId || generating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {generating ? (
              <>
                <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block', fontSize: '14px' }}>⚙️</span>
                Generando…
              </>
            ) : (
              '✨ Generar Preview'
            )}
          </button>
        </div>

        {/* ── Últimos Posts ── */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <p style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.15em',
            color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)',
            textTransform: 'uppercase', padding: '14px 16px 8px', margin: 0,
          }}>
            Últimos posts
          </p>

          <div style={{ flex: 1, padding: '0 8px 8px' }}>
            {loadingPosts ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '62px', borderRadius: '10px', margin: '4px 0' }} />
              ))
            ) : posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--c-text-muted)', fontSize: '12px' }}>
                No hay artículos aún.<br />¡Genera el primero!
              </div>
            ) : (
              posts.map(post => {
                const isActive = selectedPost?.id === post.id && !preview;
                return (
                  <div
                    key={post.id}
                    onClick={() => handleSelectPost(post)}
                    style={{
                      padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                      background: isActive ? 'rgba(196,252,21,0.07)' : 'transparent',
                      border: isActive ? '1px solid rgba(196,252,21,0.18)' : '1px solid transparent',
                      marginBottom: '3px', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{
                        flexShrink: 0, width: '6px', height: '6px', borderRadius: '50%',
                        background: post.published ? 'var(--c-lime)' : 'rgba(255,255,255,0.2)',
                        marginTop: '5px',
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{
                          fontSize: '12px', fontWeight: 600, color: 'var(--c-white)',
                          margin: '0 0 4px', lineHeight: 1.3,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          {post.title}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '9px', fontWeight: 700, color: '#000',
                            background: 'var(--c-lime)', padding: '1px 7px',
                            borderRadius: '100px', fontFamily: 'var(--f-sub)',
                          }}>
                            {post.category}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--c-text-muted)', fontFamily: 'var(--f-sub)' }}>
                            {formatDate(post.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* ══ PANEL DERECHO ═══════════════════════════════════════ */}
      <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>

        {/* Barra de progreso al generar */}
        {generating && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: 'rgba(10,10,10,0.95)',
            borderBottom: '1px solid rgba(196,252,21,0.2)',
            padding: '14px 24px',
            display: 'flex', alignItems: 'center', gap: '14px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              width: '18px', height: '18px',
              border: '2px solid var(--c-lime)', borderTopColor: 'transparent',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
            <span style={{ fontSize: '13px', color: 'var(--c-lime)', fontFamily: 'var(--f-sub)', fontWeight: 600 }}>
              {generateStep}
            </span>
          </div>
        )}

        {/* Mensajes globales */}
        {successMsg && (
          <div style={{ margin: '16px 28px 0', padding: '12px 16px', background: 'rgba(196,252,21,0.08)', border: '1px solid rgba(196,252,21,0.25)', borderRadius: '10px', fontSize: '13px', color: 'var(--c-lime)' }}>
            {successMsg}
          </div>
        )}
        {error && (
          <div style={{ margin: '16px 28px 0', padding: '12px 16px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '10px', fontSize: '13px', color: '#ff9090' }}>
            {error}
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ff9090', cursor: 'pointer', float: 'right', fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Estado vacío */}
        {!generating && !preview && !selectedPost && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '80vh',
            color: 'var(--c-text-muted)', textAlign: 'center', padding: '40px',
          }}>
            <div style={{ fontSize: '56px', marginBottom: '20px', opacity: 0.6 }}>🧬</div>
            <h3 style={{ fontFamily: 'var(--f-heading)', fontSize: '24px', color: 'var(--c-white)', marginBottom: '12px' }}>
              Contenido editorial con IA
            </h3>
            <p style={{ fontSize: '14px', maxWidth: '400px', lineHeight: 1.7, marginBottom: '8px' }}>
              Selecciona un producto en el panel izquierdo y haz clic en <strong style={{ color: 'var(--c-lime)' }}>Generar Preview</strong>.
            </p>
            <p style={{ fontSize: '13px', maxWidth: '400px', lineHeight: 1.7, color: 'rgba(255,255,255,0.35)' }}>
              La IA analiza los ingredientes activos, busca evidencia científica y redacta un artículo editorial premium. Tú revisas y decides si publicar.
            </p>
            <div style={{ display: 'flex', gap: '24px', marginTop: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {['🔬 Ingredientes activos', '📚 Estudios clínicos', '🌆 Contexto CDMX', '✅ Preview antes de publicar'].map(f => (
                <div key={f} style={{ fontSize: '12px', color: 'rgba(196,252,21,0.7)', fontFamily: 'var(--f-sub)', fontWeight: 600 }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generando: overlay con animación */}
        {generating && !preview && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '70vh', gap: '20px',
          }}>
            <div style={{
              width: '64px', height: '64px',
              border: '3px solid rgba(196,252,21,0.15)',
              borderTop: '3px solid var(--c-lime)',
              borderRadius: '50%', animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: 'var(--c-lime)', fontSize: '14px', fontFamily: 'var(--f-sub)', fontWeight: 600, textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
              {generateStep}
            </p>
            <p style={{ color: 'var(--c-text-muted)', fontSize: '12px' }}>
              Esto puede tardar 15-30 segundos…
            </p>
          </div>
        )}

        {/* Preview del post generado */}
        {!generating && preview && (
          <ArticlePanel
            key="preview"
            post={preview}
            isPreview
            publishing={publishing}
            onPublish={handlePublish}
            onDiscard={() => setPreview(null)}
            onUpdateCoverImage={handleUpdatePreviewCover}
          />
        )}

        {/* Post existente seleccionado */}
        {!generating && !preview && selectedPost && (
          <ArticlePanel
            key={selectedPost.id}
            post={selectedPost}
            onToggle={() => handleToggle(selectedPost)}
            onDelete={() => handleDelete(selectedPost)}
            onUpdateCoverImage={(url) => handleUpdateCoverImage(selectedPost.id, url)}
          />
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: #111; }
      `}</style>
    </div>
  );
}
