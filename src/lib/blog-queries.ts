
import { supabase } from './supabase';
// ============================================================
// AÑADIR AL FINAL DE src/lib/queries.ts
// ============================================================

// ─── TIPOS BLOG ──────────────────────────────────────────────
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string;
  category: string;
  tags: string[];
  author: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

// ─── BLOG QUERIES (PÚBLICO) ───────────────────────────────────

/** Lista todos los posts publicados, ordenados por fecha descendente */
export const getBlogPosts = async (limit = 20): Promise<BlogPost[]> => {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title, excerpt, cover_image, category, tags, author, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.error('getBlogPosts error:', error); return []; }
    return (data ?? []) as BlogPost[];
  } catch (err) {
    console.error('getBlogPosts error:', err);
    return [];
  }
};

/** Obtiene un post completo por su slug (solo publicados) */
export const getBlogPostBySlug = async (slug: string): Promise<BlogPost | null> => {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .single();
    if (error) { console.error('getBlogPostBySlug error:', error); return null; }
    return data as BlogPost;
  } catch (err) {
    console.error('getBlogPostBySlug error:', err);
    return null;
  }
};

/** Posts relacionados: misma categoría, excluyendo el actual */
export const getRelatedPosts = async (
  category: string,
  currentSlug: string,
  limit = 3
): Promise<BlogPost[]> => {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title, excerpt, cover_image, category, created_at')
      .eq('published', true)
      .eq('category', category)
      .neq('slug', currentSlug)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.error('getRelatedPosts error:', error); return []; }
    return (data ?? []) as BlogPost[];
  } catch (err) {
    console.error('getRelatedPosts error:', err);
    return [];
  }
};

// ─── BLOG QUERIES (ADMIN) ─────────────────────────────────────

/** Lista TODOS los posts (publicados y borradores) para el admin */
export const getAdminBlogPosts = async (): Promise<BlogPost[]> => {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('getAdminBlogPosts error:', error); return []; }
  return (data ?? []) as BlogPost[];
};

/** Crea un nuevo post */
export const createBlogPost = async (
  post: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>
): Promise<BlogPost | null> => {
  const { data, error } = await supabase
    .from('blog_posts')
    .insert([{ ...post, updated_at: new Date().toISOString() }])
    .select()
    .single();
  if (error) { console.error('createBlogPost error:', error); return null; }
  return data as BlogPost;
};

/** Actualiza un post existente */
export const updateBlogPost = async (
  id: string,
  updates: Partial<BlogPost>
): Promise<boolean> => {
  const { error } = await supabase
    .from('blog_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('updateBlogPost error:', error); return false; }
  return true;
};

/** Elimina un post */
export const deleteBlogPost = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('blog_posts')
    .delete()
    .eq('id', id);
  if (error) { console.error('deleteBlogPost error:', error); return false; }
  return true;
};

/** Alterna publicado/borrador */
export const toggleBlogPostPublished = async (
  id: string,
  published: boolean
): Promise<boolean> => {
  return updateBlogPost(id, { published });
};
/**
 * AGREGAR ESTA FUNCION AL ARCHIVO EXISTENTE: src/lib/blog-queries.ts
 *
 * Busca productos en Supabase cuya marca o tags coincidan con los
 * tags del articulo del blog o su categoria.
 * Se usa en BlogPostPage para mostrar productos reales relacionados.
 */

import { supabase } from './supabase';
import type { Product } from '../types';

export async function getProductsByBrandOrTags(
  tags: string[],
  category: string,
  limit = 4
): Promise<Product[]> {
  // Extraer marcas conocidas de los tags del post
  const KNOWN_BRANDS = ['ISDIN', 'La Roche-Posay', 'Vichy', 'CeraVe', 'Eucerin', 'Neutrogena', 'Avene'];

  const brandMatches = tags
    .map(t => KNOWN_BRANDS.find(b => t.toLowerCase().includes(b.toLowerCase())))
    .filter(Boolean) as string[];

  // Mapeo de categoria del blog → keyword de busqueda en productos
  const CATEGORY_KEYWORD_MAP: Record<string, string> = {
    'Cuidado de Piel': 'hidratante',
    'Rutinas':         'sérum',
    'Ingredientes':    'activo',
    'Consejos':        'piel',
  };

  const categoryKeyword = CATEGORY_KEYWORD_MAP[category] ?? '';

  // 1. Si hay coincidencia de marca, busca por marca primero
  if (brandMatches.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, brand, price, compare_price, image_url, images, tags, in_stock, description')
      .in('brand', brandMatches)
      .eq('in_stock', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data && data.length >= 2) {
      return data as Product[];
    }
  }

  // 2. Busca por tags del post que coincidan con tags de producto
  if (tags.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, brand, price, compare_price, image_url, images, tags, in_stock, description')
      .overlaps('tags', tags)
      .eq('in_stock', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data && data.length >= 2) {
      return data as Product[];
    }
  }

  // 3. Fallback: productos por keyword de categoria en nombre o descripcion
  if (categoryKeyword) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, brand, price, compare_price, image_url, images, tags, in_stock, description')
      .or(`name.ilike.%${categoryKeyword}%,description.ilike.%${categoryKeyword}%`)
      .eq('in_stock', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) return data as Product[];
  }

  // 4. Ultimo recurso: best sellers
  const { data } = await supabase
    .from('products')
    .select('id, name, slug, brand, price, compare_price, image_url, images, tags, in_stock, description')
    .eq('in_stock', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data as Product[]) ?? [];
}
