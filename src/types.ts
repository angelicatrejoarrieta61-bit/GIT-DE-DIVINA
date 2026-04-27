export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_price?: number;
  image_url?: string;
  images?: string[];
  in_stock: boolean;
  brand?: string;
  tags?: string[];
  description?: string;
  category?: string;
  image_status?: string;
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
}
