/**
 * Envío — una sola regla para carrito, checkout y ficha de producto.
 * $120 MXN (IVA incluido) por pedido; gratis cuando los productos (ya con descuento) suman $999 o más.
 */
import { SHIPPING_COST, FREE_SHIPPING_FROM } from './seoRules';

// Los montos viven en seoRules.js para que el SEO (también en el build) use exactamente los mismos.
export { SHIPPING_COST, FREE_SHIPPING_FROM };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Costo de envío para un subtotal de productos (después de cupón). */
export function shippingFor(subtotal: number): number {
  if (!subtotal || subtotal <= 0) return 0;
  return subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST;
}

/** Cuánto falta para el envío gratis (0 si ya aplica). */
export function missingForFreeShipping(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_FROM ? 0 : round2(FREE_SHIPPING_FROM - subtotal);
}

/** Total a cobrar: productos + envío. */
export function orderTotal(subtotal: number): number {
  return round2(subtotal + shippingFor(subtotal));
}
