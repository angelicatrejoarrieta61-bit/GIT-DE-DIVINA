/**
 * Envío — una sola regla para carrito, checkout y ficha de producto.
 * $120 MXN (IVA incluido) por pedido; gratis cuando los productos (ya con descuento) suman $999 o más.
 * Cupón de envío (código ENVIO…): su monto se resta del envío, nunca más que lo que cuesta el envío.
 */
import { SHIPPING_COST, FREE_SHIPPING_FROM, SHIPPING_ACTIVE } from './seoRules';

// Los montos viven en seoRules.js para que el SEO (también en el build) use exactamente los mismos.
export { SHIPPING_COST, FREE_SHIPPING_FROM };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Envío según la regla ($120 bajo $999), sin cupón. */
export function baseShipping(subtotal: number): number {
  if (!SHIPPING_ACTIVE || !subtotal || subtotal <= 0) return 0;
  return subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST;
}

/** Cuánto del envío cubre un cupón de envío (monto fijo o %), con tope en el envío. */
export function shippingCouponDiscount(type: 'percent' | 'fixed', value: number, subtotal: number): number {
  const base = baseShipping(subtotal);
  if (base <= 0 || !value || value <= 0) return 0;
  const raw = type === 'percent' ? base * (Math.min(value, 100) / 100) : value;
  return round2(Math.min(raw, base));
}

/** Costo de envío para un subtotal de productos (después de cupón), menos el descuento de envío. */
export function shippingFor(subtotal: number, shipDiscount = 0): number {
  return round2(Math.max(0, baseShipping(subtotal) - (shipDiscount || 0)));
}

/** Cuánto falta para el envío gratis (0 si ya aplica). */
export function missingForFreeShipping(subtotal: number): number {
  return !SHIPPING_ACTIVE || subtotal >= FREE_SHIPPING_FROM ? 0 : round2(FREE_SHIPPING_FROM - subtotal);
}

/** Total a cobrar: productos + envío. */
export function orderTotal(subtotal: number, shipDiscount = 0): number {
  return round2(subtotal + shippingFor(subtotal, shipDiscount));
}
