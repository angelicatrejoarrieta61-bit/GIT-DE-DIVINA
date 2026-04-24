import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase env vars missing. Check your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  timestamp?: number;
}

export const getImageUrl = (path: string, options: ImageOptions = {}): string => {
  if (!path) return '/placeholder.svg';
  // Skip optimization for external URLs, base64 strings, or local Vite assets
  if (path.startsWith('http') || path.startsWith('data:') || path.includes('assets') || path.includes('src')) return path;

  const { width, height, quality, timestamp } = options;
  
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Si no hay transformaciones, devolvemos la URL pública estándar
  if (!width && !height && !quality) {
    const { data } = supabase.storage.from('divina-assets').getPublicUrl(cleanPath);
    let url = data.publicUrl;
    if (timestamp) url += `?t=${timestamp}`;
    return url;
  }

  // Usar el endpoint de render para optimizar peso/tamaño (WebP al vuelo)
  const renderUrl = `${supabaseUrl}/storage/v1/render/image/public/divina-assets/${cleanPath}`;
  const params = new URLSearchParams();
  if (width) params.append('width', width.toString());
  if (height) params.append('height', height.toString());
  params.append('quality', (quality || 75).toString());
  params.append('resize', 'contain');
  params.append('format', 'origin'); // Permite que Supabase entregue WebP si el navegador lo soporta
  if (timestamp) params.append('t', timestamp.toString());

  return `${renderUrl}?${params.toString()}`;
};

/**
 * Genera un conjunto de imágenes (srcset) para diferentes tamaños de pantalla.
 * Esto permite que el navegador descargue solo el tamaño que necesita:
 * - Celular: 300-400px
 * - Tableta: 600-800px
 * - Escritorio: 1200-1920px
 */
export const getImageSrcSet = (path: string, widths: number[], options: Omit<ImageOptions, 'width'> = {}): string | undefined => {
  if (!path || path.startsWith('http') || path.startsWith('data:') || path.includes('assets') || path.includes('src')) return undefined;
  
  return widths
    .map(w => `${getImageUrl(path, { ...options, width: w })} ${w}w`)
    .join(', ');
};

// Upload image to Supabase Storage
export const uploadProductImage = async (
  file: File,
  slug: string
): Promise<string | null> => {
  const ext = file.name.split('.').pop();
  const path = `products/${slug}.${ext}`;

  const { error } = await supabase.storage
    .from('divina-assets')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  return path;
};

// Subir activos genéricos (Logo, Hero, etc)
export const uploadAsset = async (
  file: File,
  name: string
): Promise<string | null> => {
  const ext = file.name.split('.').pop();
  const path = `global/${name}.${ext}`;

  const { error } = await supabase.storage
    .from('divina-assets')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    console.error('Upload asset error:', error);
    return null;
  }

  return path;
};
