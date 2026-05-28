/**
 * BlogPostPage.tsx — Vista individual de un artículo
 * Ruta: /blog/:slug
 *
 * Features:
 * - Barra de progreso de lectura
 * - Tabla de contenidos generada dinámicamente
 * - Posts relacionados al final
 * - Meta semántico (h1, article, time) para SEO
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getBlogPostBySlug, getRelatedPosts, type BlogPost } from '../../lib/blog-queries';

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1200&q=80';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Calcula tiempo de lectura estimado */
function readingTime(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/** Extrae h2 del HTML para tabla de contenidos */
function extractHeadings(html: string): { id: string; text: string }[] {
  const matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)];
  return matches.map((m, i) => ({
    id: `heading-${i}`,
    text: m[1].replace(/<[^>]+>/g, ''),
  }));
}

/** Inyecta IDs a los h2 del HTML para anchor links */
function injectHeadingIds(html: string): string {
  let i = 0;
  return html.replace(/<h2([^>]*)>/gi, () => `<h2 id="heading-${i++}">`);
}

// ─── Barra de progreso ────────────────────────────────────────
function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handler = () => {
      const el = document.documentElement;
      const scrolled = el.scrollTop;
      const total    = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? (scrolled / total) * 100 : 0);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-gray-100">
      <div
        className="h-full bg-lime-500 transition-all duration-100"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// ─── Tarjeta relacionada ──────────────────────────────────────
function RelatedCard({ post }: { post: BlogPost }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex gap-3 rounded-xl overflow-hidden hover:bg-lime-50 transition-colors p-2 -m-2"
    >
      <img
        src={post.cover_image || FALLBACK_IMG}
        alt={post.title}
        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
        loading="lazy"
      />
      <div>
        <p className="text-gray-800 text-sm font-semibold leading-snug group-hover:text-lime-700 transition-colors line-clamp-2">
          {post.title}
        </p>
        <span className="text-gray-400 text-xs">{formatDate(post.created_at)}</span>
      </div>
    </Link>
  );
}

// ─── Página ───────────────────────────────────────────────────
export function BlogPostPage() {
  const { slug }          = useParams<{ slug: string }>();
  const navigate          = useNavigate();
  const [post, setPost]   = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const contentRef        = useRef<HTMLDivElement>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) return null;

  const mins     = readingTime(post.content);
  const headings = extractHeadings(post.content);
  const html     = injectHeadingIds(post.content);

  return (
    <>
      <ReadingProgress />

      <div className="min-h-screen bg-white">

        {/* ── Breadcrumb ── */}
        <div className="max-w-6xl mx-auto px-4 pt-6 pb-2">
          <nav className="flex items-center gap-2 text-sm text-gray-400">
            <Link to="/" className="hover:text-lime-600 transition-colors">Inicio</Link>
            <span>/</span>
            <Link to="/blog" className="hover:text-lime-600 transition-colors">Blog</Link>
            <span>/</span>
            <span className="text-gray-600 line-clamp-1">{post.title}</span>
          </nav>
        </div>

        {/* ── Hero imagen ── */}
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="relative rounded-2xl overflow-hidden h-64 md:h-96 bg-gray-100">
            <img
              src={post.cover_image || FALLBACK_IMG}
              alt={post.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </div>
        </div>

        {/* ── Layout: contenido + sidebar ── */}
        <div className="max-w-6xl mx-auto px-4 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12">

            {/* ── Artículo principal ── */}
            <article>
              {/* Meta */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-xs font-semibold bg-lime-100 text-lime-800 px-3 py-1 rounded-full">
                  {post.category}
                </span>
                <time
                  dateTime={post.created_at}
                  className="text-gray-400 text-sm"
                >
                  {formatDate(post.created_at)}
                </time>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400 text-sm">{mins} min de lectura</span>
              </div>

              {/* Título */}
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
                {post.title}
              </h1>

              {/* Autor */}
              <div className="flex items-center gap-3 mb-8 pb-8 border-b border-gray-100">
                <div className="w-9 h-9 rounded-full bg-lime-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {post.author.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-600 font-medium">{post.author}</span>
              </div>

              {/* Contenido HTML */}
              <div
                ref={contentRef}
                className="prose prose-gray prose-lg max-w-none
                  prose-headings:font-bold prose-headings:text-gray-900
                  prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4
                  prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
                  prose-p:text-gray-600 prose-p:leading-relaxed prose-p:mb-5
                  prose-li:text-gray-600 prose-li:leading-relaxed
                  prose-ul:my-4 prose-ul:pl-4
                  prose-a:text-lime-600 prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-gray-800"
                dangerouslySetInnerHTML={{ __html: html }}
              />

              {/* Tags */}
              {post.tags.length > 0 && (
                <div className="mt-10 pt-6 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                    Etiquetas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA Productos */}
              <div className="mt-10 rounded-2xl bg-lime-50 border border-lime-200 p-6 flex flex-col sm:flex-row items-center gap-5">
                <div className="flex-1">
                  <p className="font-bold text-gray-900 mb-1">
                    Encuentra los productos que necesitas
                  </p>
                  <p className="text-gray-500 text-sm">
                    Explora nuestro catálogo de cuidado de piel seleccionado para vivir en CDMX.
                  </p>
                </div>
                <Link
                  to="/catalogo"
                  className="flex-shrink-0 bg-lime-500 hover:bg-lime-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
                >
                  Ver catálogo →
                </Link>
              </div>
            </article>

            {/* ── Sidebar ── */}
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-8">

                {/* Tabla de contenidos */}
                {headings.length > 0 && (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
                      En este artículo
                    </p>
                    <nav className="space-y-2">
                      {headings.map(h => (
                        <a
                          key={h.id}
                          href={`#${h.id}`}
                          className="block text-sm text-gray-500 hover:text-lime-700 hover:translate-x-1 transition-all duration-200 leading-snug"
                        >
                          {h.text}
                        </a>
                      ))}
                    </nav>
                  </div>
                )}

                {/* Posts relacionados */}
                {related.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
                      También te puede interesar
                    </p>
                    <div className="space-y-4">
                      {related.map(r => (
                        <RelatedCard key={r.id} post={r} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Volver al blog */}
                <Link
                  to="/blog"
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-lime-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Volver al blog
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
