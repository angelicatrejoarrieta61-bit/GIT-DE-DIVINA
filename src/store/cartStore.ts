import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product } from '../types';

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, variant?: string) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  total: () => number;
  itemCount: () => number;
  
  // Coupon state
  couponCode: string | null;
  discountPercentage: number;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  discountAmount: () => number;
  totalAfterDiscount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      couponCode: null,
      discountPercentage: 0,

      addItem: (product, variant) => {
        const items = get().items;
        const existing = items.find(
          i => i.product.id === product.id && i.variant === variant
        );
        if (existing) {
          set({
            items: items.map(i =>
              i.product.id === product.id && i.variant === variant
                ? { ...i, quantity: i.quantity + 1 }
                : i
            ),
            isOpen: true,
          });
        } else {
          set({ items: [...items, { product, quantity: 1, variant }], isOpen: true });
        }
      },

      removeItem: (productId) =>
        set({ items: get().items.filter(i => i.product.id !== productId) }),

      updateQty: (productId, qty) => {
        if (qty <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map(i =>
            i.product.id === productId ? { ...i, quantity: qty } : i
          ),
        });
      },

      clearCart: () => set({ items: [], couponCode: null, discountPercentage: 0 }),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      total: () =>
        get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),

      itemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),

      applyCoupon: (code: string) => {
        const cleanCode = code.trim().toUpperCase();
        if (cleanCode === 'DESCUENTO202610') {
          set({ couponCode: cleanCode, discountPercentage: 10 });
          return true;
        }
        return false;
      },

      removeCoupon: () => {
        set({ couponCode: null, discountPercentage: 0 });
      },

      discountAmount: () => {
        const pct = get().discountPercentage;
        if (pct <= 0) return 0;
        return get().total() * (pct / 100);
      },

      totalAfterDiscount: () => {
        return get().total() - get().discountAmount();
      },
    }),
    { name: 'divina-cart' }
  )
);
