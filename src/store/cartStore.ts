import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product } from '../types';
import { validateCoupon, couponDiscount, type CouponType } from '../lib/coupons';
import { supabase } from '../lib/supabase';
import { trackProductEvent } from '../lib/productEvents';

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addItem: (product: Product, variant?: string) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  /**
   * Trae precio y existencia actuales de la base (los precios cambian solos con la revisión automática).
   * Quita lo que ya no está disponible. Devuelve qué cambió para avisar a la clienta.
   */
  refreshPrices: () => Promise<{ changed: string[]; removed: string[] }>;
  openCart: () => void;
  closeCart: () => void;
  total: () => number;
  itemCount: () => number;

  // Cupón (se valida contra la tabla `coupons` de Supabase)
  couponCode: string | null;
  couponType: CouponType;
  couponValue: number;
  couponMin: number;
  /** Valida y aplica. Devuelve null si se aplicó o el mensaje de error. */
  applyCoupon: (code: string) => Promise<string | null>;
  /** Vuelve a validar el cupón guardado. Si ya no aplica lo quita y devuelve el motivo. */
  revalidateCoupon: () => Promise<string | null>;
  removeCoupon: () => void;
  /** true si el carrito bajó del mínimo de compra del cupón (el descuento queda en 0). */
  couponBelowMin: () => boolean;
  discountAmount: () => number;
  totalAfterDiscount: () => number;
}

const NO_COUPON = { couponCode: null, couponType: 'percent' as CouponType, couponValue: 0, couponMin: 0 };

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      ...NO_COUPON,

      addItem: (product, variant) => {
        trackProductEvent(product.id, 'add_to_cart');
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

      clearCart: () => set({ items: [], ...NO_COUPON }),

      refreshPrices: async () => {
        const items = get().items;
        const ids = [...new Set(items.map((i) => i.product.id))];
        if (!ids.length) return { changed: [], removed: [] };
        const { data, error } = await supabase.from('products').select('id, name, price, compare_price, in_stock').in('id', ids);
        if (error || !data) return { changed: [], removed: [] };
        const byId = new Map(data.map((p) => [p.id as string, p]));
        const changed: string[] = [];
        const removed: string[] = [];
        const next = items.flatMap((i) => {
          const p = byId.get(i.product.id);
          if (!p || p.in_stock === false) { removed.push(i.product.name); return []; }
          const price = Number(p.price);
          if (Number.isFinite(price) && Math.abs(price - i.product.price) >= 0.01) {
            changed.push(i.product.name);
            return [{ ...i, product: { ...i.product, price, compare_price: p.compare_price ?? i.product.compare_price } }];
          }
          return [i];
        });
        if (changed.length || removed.length) set({ items: next });
        return { changed, removed };
      },
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      total: () =>
        get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),

      itemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),

      applyCoupon: async (code: string) => {
        const res = await validateCoupon(code, get().total());
        if (!res.ok || !res.coupon) return res.message || 'Código no válido';
        set({
          couponCode: res.coupon.code,
          couponType: res.coupon.type,
          couponValue: res.coupon.value,
          couponMin: res.coupon.minSubtotal,
        });
        return null;
      },

      revalidateCoupon: async () => {
        const code = get().couponCode;
        if (!code) return null;
        // Sin subtotal: el mínimo de compra se maneja aparte (couponBelowMin) para no quitar el cupón
        // solo porque la persona bajó una pieza.
        const res = await validateCoupon(code);
        if (res.ok && res.coupon) {
          set({
            couponCode: res.coupon.code,
            couponType: res.coupon.type,
            couponValue: res.coupon.value,
            couponMin: res.coupon.minSubtotal,
          });
          return null;
        }
        if (res.reason === 'error') return null; // falla de red: se conserva y se vuelve a intentar al pagar
        set({ ...NO_COUPON });
        return `${code}: ${res.message || 'ya no es válido'}`;
      },

      removeCoupon: () => set({ ...NO_COUPON }),

      couponBelowMin: () => {
        const { couponCode, couponMin } = get();
        return !!couponCode && couponMin > 0 && get().total() < couponMin;
      },

      discountAmount: () => {
        const { couponCode, couponType, couponValue } = get();
        if (!couponCode || get().couponBelowMin()) return 0;
        return couponDiscount(couponType, couponValue, get().total());
      },

      totalAfterDiscount: () => {
        return Math.round((get().total() - get().discountAmount()) * 100) / 100;
      },
    }),
    {
      name: 'divina-cart',
      version: 1,
      // v0 guardaba { couponCode, discountPercentage }; se convierte al formato nuevo.
      migrate: (persisted: unknown, version: number) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        if (version < 1) {
          const pct = Number(s.discountPercentage) || 0;
          const code = typeof s.couponCode === 'string' && pct > 0 ? s.couponCode : null;
          delete s.discountPercentage;
          return { ...s, couponCode: code, couponType: 'percent', couponValue: code ? pct : 0, couponMin: 0 };
        }
        return s;
      },
    }
  )
);
