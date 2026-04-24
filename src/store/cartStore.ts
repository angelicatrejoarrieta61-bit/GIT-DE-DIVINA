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
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

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

      clearCart: () => set({ items: [] }),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      total: () =>
        get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),

      itemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    { name: 'divina-cart' }
  )
);
