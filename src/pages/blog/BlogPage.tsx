/**
 * BlogPage.tsx — Listado de artículos del blog
 * Ruta: /blog
 *
 * Diseño: editorial limpio con acento lime (#a3e635) consistente
 * con la paleta de Divina Store MX. Mobile-first, grid responsivo.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBlogPosts, type BlogPost } from '../lib/blog-queries';

// Imagen de portada por defecto si el post no tiene una
const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&q=80';

// Mapa de colores por categoría
const CATEGORY_COLORS: Record<string, string> = {
  'Cuidado de Piel': 'bg-lime-100 text-lime-800',
  Rutinas:           'bg-sky-100 text-sky-800',
  Ingredientes:      'bg-violet-100 text-violet-800',
  Consejos:          'bg-amber-100 text-amber-800',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ─── Skeleton card mientras carga ────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 animate-pulse">
      <div className="h-52 bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-3 bg-gray-200 rounded w-1/3" />
        <div className="h-5 bg-gray-200 rounded w-5/6" />
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-4/5" />
      </div>
    </div>
  );
}

// ─── Tarjeta de artículo ──────────────────────────────────────
function PostCard({ post, featured = false }: { post: BlogPost; featured?: boolean }) {
  const catClass = CATEGORY_COLORS[post.category] ?? 'bg-gray-100 text-gray-700';

  if (featured) {
    return (
      <Link
        to={`/blog/${post.slug}`}
        className="group col-span-full lg:col-span-2 relative rounded-2xl overflow-hidden block shadow-md hover:shadow-xl transition-shadow duration-300"
      >
        <div className="relative h-72 md:h-96">
          <img
            src={post.cover_image || FALLBACK_IMG}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Content overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full mb-3 ${catClass}`}>
              {post.category}
            </span>
            <h2 className="text-white text-xl md:text-2xl font-bold leading-snug mb-2 group-hover:text-lime-300 transition-colors">
              {post.title}
            </h2>
            <p className="text-white/75 text-sm line-clamp-2">{post.excerpt}</p>
            <div className="flex items-center gap-3 mt-4">
              <span className="text-white/60 text-xs">{formatDate(post.created_at)}</span>
              <span className="text-lime-400 text-xs font-medium flex items-center gap-1">
                Leer artículo
                <svg className="w-3 h-3 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-100 hover:border-lime-300 hover:shadow-lg transition-all duration-300"
    >
      <div className="relative h-48 overflow-hidden bg-gray-100">
        <img
          src={post.cover_image || FALLBACK_IMG}
          alt={post.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="flex flex-col flex-1 p-5">
        <span className={`self-start text-xs font-semibold px-2.5 py-1 rounded-full mb-3 ${catClass}`}>
          {post.category}
        </span>
        <h3 className="text-gray-900 font-bold text-base leading-snug mb-2 group-hover:text-lime-700 transition-colors line-clamp-2">
          {post.title}
        </h3>
        <p className="text-gray-500 text-sm leading-relaxed line-clamp-3 flex-1">
          {post.excerpt}
        </p>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <span className="text-gray-400 text-xs">{formatDate(post.created_at)}</span>
          <span className="text-lime-600 text-xs font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
            Leer
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Página principal ─────────────────────────────────────────
export function BlogPage() {
  const [posts, setPosts]     = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('Todos');

  const categories = ['Todos', 'Cuidado de Piel', 'Rutinas', 'Ingredientes', 'Consejos'];

  useEffect(() => {
    getBlogPosts(30).then(data => {
      setPosts(data);
      setLoading(false);
    });
  }, []);

  const filtered = filter === 'Todos'
    ? posts
    : posts.filter(p => p.category === filter);

  const [featured, ...rest] = filtered;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ── */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-lime-700 bg-lime-50 border border-lime-200 rounded-full px-3 py-1 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse" />
              Blog de bienestar urbano
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-3">
              Cuida tu piel en la Ciudad de México
            </h1>
            <p className="text-gray-500 text-base md:text-lg leading-relaxed">
              Guías, rutinas e ingredientes activos para proteger tu piel de la
              contaminación, el ozono y las partículas PM2.5 del aire capitalino.
            </p>
          </div>
        </div>
      </section>

      {/* ── Filtros por categoría ── */}
      <section className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`whitespace-nowrap text-sm font-medium px-4 py-1.5 rounded-full border transition-all duration-200 ${
                  filter === cat
                    ? 'bg-lime-500 text-white border-lime-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-lime-400 hover:text-lime-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Grid de artículos ── */}
      <section className="max-w-6xl mx-auto px-4 py-10">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-medium">No hay artículos en esta categoría aún.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured && (
              <PostCard post={featured} featured />
            )}
            {rest.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
