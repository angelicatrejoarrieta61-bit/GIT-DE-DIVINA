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
      .select('*')
      .eq('slug', slug)
      .single();
    return data;
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
      .select('*, collection:collections(id,name,slug)')
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
    const { data, error } = await supabase
      .from('products')
      .select('*, collection:collections!inner(id,name,slug)')
      .eq('collection.slug', collectionSlug)
      .eq('in_stock', true)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    return data ?? [];
  } catch (err) {
    console.error('getProductsByCollection error:', err);
    return [];
  }
};

export const getProductBySlug = async (slug: string): Promise<Product | null> => {
  try {
    const { data } = await supabase
      .from('products')
      .select('*, collection:collections(id,name,slug)')
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
      .select('*, collection:collections(id,name,slug)')
      .eq('in_stock', true)
      .contains('tags', ['TOP_HOME'])
      .order('created_at', { ascending: false })
      .limit(limit);
      
    // If no manually selected products, fallback to latest
    if (!data || data.length === 0) {
      const { data: fallback } = await supabase
        .from('products')
        .select('*, collection:collections(id,name,slug)')
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
    .select('*, collection:collections(id,name,slug)')
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
