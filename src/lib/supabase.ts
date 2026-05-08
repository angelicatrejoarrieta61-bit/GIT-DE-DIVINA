import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.trim() || '';
const supabaseUrl = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') : '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string)?.trim() || '';

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

/**
 * Retorna la URL pública de una imagen, opcionalmente optimizada mediante el servicio de render de Supabase.
 */
export const getImageUrl = (path: string, options: ImageOptions = {}): string => {
  if (!path) return '/placeholder.svg';
  
  // Si ya es una URL completa, base64 o blob, se retorna tal cual
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:') || path.includes('assets') || path.includes('src')) {
    return path;
  }

  const { width, height, quality, timestamp } = options;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Si no hay opciones de transformación, usamos getPublicUrl estándar
  if (!width && !height && !quality) {
    const { data } = supabase.storage.from('divina-assets').getPublicUrl(cleanPath);
    let url = data.publicUrl;
    if (timestamp) url += `?t=${timestamp}`;
    return url;
  }

  // Intentamos usar el endpoint de optimización (render) si está disponible en el proyecto
  const renderUrl = `${supabaseUrl}/storage/v1/render/image/public/divina-assets/${cleanPath}`;
  const params = new URLSearchParams();
  if (width) params.append('width', width.toString());
  if (height) params.append('height', height.toString());
  params.append('quality', (quality || 80).toString());
  params.append('resize', 'contain');
  if (timestamp) params.append('t', timestamp.toString());

  return `${renderUrl}?${params.toString()}`;
};

export const getImageSrcSet = (path: string, widths: number[], options: Omit<ImageOptions, 'width'> = {}): string | undefined => {
  if (!path || path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:') || path.includes('assets') || path.includes('src')) {
    return undefined;
  }
  
  return widths
    .map(w => `${getImageUrl(path, { ...options, width: w })} ${w}w`)
    .join(', ');
};

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
    console.error('Upload product image error:', error);
    return null;
  }

  return path;
};

export const uploadAsset = async (
  file: File,
  name: string
): Promise<string | null> => {
  const ext = file.name.split('.').pop();
  const timestamp = Date.now();
  const path = `global/${name}_${timestamp}.${ext}`;

  const { error } = await supabase.storage
    .from('divina-assets')
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });

  if (error) {
    console.error('Upload asset error:', error);
    return null;
  }

  return path;
};
