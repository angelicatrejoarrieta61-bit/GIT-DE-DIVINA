export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compare_price?: number;
  brand?: string;
  image_url?: string;
  images?: string[];
  collection_id?: string;
  collection?: Collection;
  in_stock: boolean;
  tags?: string[];
  variants?: ProductVariant[];
  image_status: 'pending' | 'done';
  created_at: string;
}

export interface ProductVariant {
  name: string;
  options: string[];
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  sort_order: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: string;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address?: string;
  items: CartItem[];
  total: number;
  status: 'pending' | 'paid' | 'shipped' | 'cancelled';
  clip_payment_id?: string;
  created_at: string;
}

export interface StoreConfig {
  key: string;
  value: string;
}
