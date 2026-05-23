import { supabase } from './supabase';
import type { Product, Collection, Order } from '../types';

// ─── COLLECTIONS ────────────────────────────────────────────────
export const getCollections = async (): Promise<Collection[]> => {
  try {
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .order('sort_order');
    if (error) { console.error(error); return []; }
    return data ?? [];
  } catch (err) {
    console.error('getCollections error:', err);
    return [];
  }
};

export const getCollectionBySlug = async (slug: string): Promise<Collection | null> => {
  try {
    const { data } = await supabase
      .from('collections')
      .select('*');
      
    if (!data) return null;
    
    const lowerSlug = slug.toLowerCase();
    const matched = data.find(c => 
      (c.slug || '').toLowerCase() === lowerSlug ||
      (c.name || '').toLowerCase().replace(/\s+/g, '-') === lowerSlug ||
      (c.id || '').toLowerCase() === lowerSlug
    );
    
    return matched || null;
  } catch (err) {
    console.error('getCollectionBySlug error:', err);
    return null;
  }
};

// ─── PRODUCTS ───────────────────────────────────────────────────
export const getProducts = async (limit = 48): Promise<Product[]> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, collection:collections!category(id,name,slug)')
      .eq('in_stock', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.error(error); return []; }
    return data ?? [];
  } catch (err) {
    console.error('getProducts error:', err);
    return [];
  }
};

export const getProductsByCollection = async (collectionSlug: string): Promise<Product[]> => {
  try {
    // 1. Intentar obtener la colección primero (falla si hay RLS en collections)
    const col = await getCollectionBySlug(collectionSlug);
      
    // 2. Traer productos con su colección anidada
    const { data, error } = await supabase
      .from('products')
      .select('*, collection:collections!category(id,name,slug)')
      .eq('in_stock', true)
      .order('created_at', { ascending: false });
      
    if (error) { console.error(error); return []; }
    
    const allProducts = data ?? [];
    
    // 3. Filtrar localmente
    const lowerSlug = collectionSlug.toLowerCase();
    
    return allProducts.filter(p => {
      // Si la base de datos nos dio la colección, la usamos
      if (col && p.category === col.id) return true;
      
      // Si RLS bloqueó collections pero el join funcionó:
      if (p.collection) {
        const c: any = p.collection;
        if ((c.slug || '').toLowerCase() === lowerSlug) return true;
        if ((c.name || '').toLowerCase().replace(/\s+/g, '-') === lowerSlug) return true;
      }
      
      return false;
    }).map(p => ({ ...p, collection: p.collection || col }));
  } catch (err) {
    console.error('getProductsByCollection error:', err);
    return [];
  }
};

export const getProductBySlug = async (slug: string): Promise<Product | null> => {
  try {
    const { data } = await supabase
      .from('products')
      .select('*, collection:collections!category(id,name,slug)')
      .eq('slug', slug)
      .single();
    return data;
  } catch (err) {
    console.error('getProductBySlug error:', err);
    return null;
  }
};

export const getBestSellers = async (limit = 8): Promise<Product[]> => {
  try {
    const { data } = await supabase
      .from('products')
      .select('*, collection:collections!category(id,name,slug)')
      .eq('in_stock', true)
      .contains('tags', ['TOP_HOME'])
      .order('created_at', { ascending: false })
      .limit(limit);
      
    // If no manually selected products, fallback to latest
    if (!data || data.length === 0) {
      const { data: fallback } = await supabase
        .from('products')
        .select('*, collection:collections!category(id,name,slug)')
        .eq('in_stock', true)
        .order('created_at', { ascending: false })
        .limit(limit);
      return fallback ?? [];
    }
    
    return data ?? [];
  } catch (err) {
    console.error('getBestSellers error:', err);
    return [];
  }
};

// ─── ADMIN PRODUCTS ─────────────────────────────────────────────
export const getAdminProducts = async (): Promise<Product[]> => {
  const { data, error } = await supabase
    .from('products')
    .select('*, collection:collections!category(id,name,slug)')
    .order('name');
  if (error) { console.error(error); return []; }
  return data ?? [];
};

export const updateProduct = async (id: string, updates: Partial<Product>): Promise<boolean> => {
  const { error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id);
  if (error) { console.error(error); return false; }
  return true;
};

export const createProduct = async (product: Partial<Product>): Promise<Product | null> => {
  const { data, error } = await supabase
    .from('products')
    .insert([product])
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
};

export const deleteProduct = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);
  if (error) { console.error(error); return false; }
  return true;
};

export const getProductsWithoutImage = async (): Promise<Product[]> => {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('image_status', 'pending')
    .order('name');
  return data ?? [];
};

// ─── ORDERS ─────────────────────────────────────────────────────
export const createOrder = async (order: Omit<Order, 'id' | 'created_at'>): Promise<Order | null> => {
  const { data, error } = await supabase
    .from('orders')
    .insert([order])
    .select()
    .single();
  if (error) { console.error(error); return null; }
  return data;
};
export const deleteUnpaidOrders = async (): Promise<boolean> => {
  const { error } = await supabase
    .from('orders')
    .delete()
    .not('status', 'in', '("paid","shipped","delivered")');
  if (error) { console.error('[deleteUnpaidOrders]', error); return false; }
  return true;
};
export const getOrders = async (): Promise<Order[]> => {
  const { data } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  return data ?? [];
};

export const updateOrderStatus = async (id: string, status: Order['status']): Promise<void> => {
  await supabase.from('orders').update({ status }).eq('id', id);
};

export const deleteAllOrders = async (): Promise<boolean> => {
  const { error } = await supabase.from('orders').delete().neq('id', '0'); // Supabase requiere un filtro
  if (error) { console.error(error); return false; }
  return true;
};

// ─── STORE CONFIG ────────────────────────────────────────────────
export const getStoreConfig = async (): Promise<Record<string, string>> => {
  try {
    const { data, error } = await supabase.from('store_config').select('*');
    if (error) { console.error(error); return {}; }
    if (!data) return {};
    return Object.fromEntries(data.map(r => [r.key, r.value]));
  } catch (err) {
    console.error('getStoreConfig error:', err);
    return {};
  }
};

export const setStoreConfig = async (key: string, value: string): Promise<void> => {
  await supabase.from('store_config').upsert({ key, value }, { onConflict: 'key' });
};
