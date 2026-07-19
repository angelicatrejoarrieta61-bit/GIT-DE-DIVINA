export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_price?: number;
  image_url?: string;
  images?: string[];
  in_stock: boolean;
  stock?: number;
  brand?: string;
  tags?: string[];
  description?: string;
  category?: string;
  image_status?: string;
  sku?: string;
  collection?: Collection | null;
  routine_step?: string;
  concentration?: string;
  concerns?: string[];
  skin_types?: string[];
  how_to_use?: string;
  ingredients?: string[];
  benefits?: string[];
  meta_keywords?: string[];
  faq?: Array<{ q: string; a: string }>;
  ingredients_info?: Array<{ name: string; benefit: string; pct?: string }>;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  image_url?: string;
  description?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: string;
}

export interface Order {
  id: string;
  total: number;
  items: CartItem[];
  created_at?: string;
  status?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_city?: string;
  customer_state?: string;
  customer_neighborhood?: string;
  customer_zip?: string;
  customer_reference?: string;
  payment_info?: any;
  accepts_marketing?: boolean;
  promoter_id?: string;
  promoter_code?: string;
  commission_rate?: number;
  commission_amount?: number;
  commission_status?: 'not_applicable' | 'pending' | 'paid' | 'cancelled';
  commission_paid_at?: string;
}

export interface Promoter {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  social_handle?: string;
  code: string;
  status: 'active' | 'paused';
  commission_rate: number;
  terms_accepted: boolean;
  created_at?: string;
  updated_at?: string;
}
