/**
 * orderPublic.ts — Consulta del pedido para el cliente (página de pago exitoso y /mi-pedido).
 * Los datos vienen del servidor (/api/send-email · type order-lookup), nunca directo de la tabla.
 */

export interface PublicOrderItem {
  name: string;
  slug: string | null;
  image_url: string | null;
  variant: string | null;
  qty: number;
  price: number;
}

export interface PublicOrder {
  id: string;
  number: string;
  created_at: string | null;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | string;
  first_name: string | null;
  email_masked: string | null;
  items: PublicOrderItem[];
  subtotal: number;
  discount: number;
  coupon_code: string | null;
  shipping: number;
  total: number;
  address: {
    name: string | null; street: string | null; neighborhood: string | null;
    city: string | null; state: string | null; zip: string | null; reference: string | null;
  };
  delivery: { kind: 'personal' | 'proveedor' | 'paqueteria' | null; label: string | null };
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
}

type LookupArgs = { orderId: string } | { number: string; email: string };

/** Consulta un pedido. Lanza Error con un mensaje listo para mostrar. */
export async function lookupOrder(args: LookupArgs): Promise<PublicOrder> {
  let r: Response;
  try {
    r = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'order-lookup', ...args }),
    });
  } catch {
    throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok || !j.order) throw new Error(j?.error || 'No se pudo consultar el pedido.');
  return j.order as PublicOrder;
}

// ── Pedidos guardados en este dispositivo (para verlos sin escribir nada) ──
const KEY = 'divina-my-orders';
const MAX = 10;

export function savedOrderIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberOrder(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    const next = [id, ...savedOrderIds().filter((x) => x !== id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* almacenamiento bloqueado: se puede consultar con número y correo */ }
}

export function forgetOrder(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(savedOrderIds().filter((x) => x !== id)));
  } catch { /* nada */ }
}

// ── Presentación ──
export const orderMoney = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

export const orderDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const ORDER_STATUS: Record<string, { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' }> = {
  pending: { label: 'Pago no completado', tone: 'warn' },
  paid: { label: 'Preparando tu pedido', tone: 'info' },
  shipped: { label: 'En camino', tone: 'info' },
  delivered: { label: 'Entregado', tone: 'ok' },
  cancelled: { label: 'Cancelado', tone: 'bad' },
};

/** Paso actual de la línea de tiempo (0 = pagado … 3 = entregado). -1 = sin pagar o cancelado. */
export function orderStep(status: string): number {
  return ({ paid: 1, shipped: 2, delivered: 3 } as Record<string, number>)[status] ?? -1;
}
