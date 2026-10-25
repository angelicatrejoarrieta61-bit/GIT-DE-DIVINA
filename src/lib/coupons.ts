/**
 * coupons.ts — Códigos de descuento.
 * - Tienda: validateCoupon() pregunta a Supabase (función validate_coupon) si un código aplica.
 * - Admin: lectura y escritura de la tabla `coupons` (requiere sesión).
 * - Regla de cálculo única: couponDiscount() la usan carrito, checkout y admin.
 * Migración: supabase/migrations/20261025120000_coupons.sql
 */
import { supabase } from './supabase';

export type CouponType = 'percent' | 'fixed';

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: CouponType;
  discount_value: number;
  min_subtotal: number;
  max_uses: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type CouponInput = Omit<Coupon, 'id' | 'created_at' | 'updated_at'>;

/** Cupón ya validado, tal como lo guarda el carrito. */
export interface AppliedCoupon {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
}

/** ok=true trae `coupon`; ok=false trae `reason` y `message` para mostrar. */
export interface CouponCheck {
  ok: boolean;
  coupon?: AppliedCoupon;
  reason?: string;
  message?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Normaliza lo que escribe la persona: mayúsculas, sin espacios. */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/\s+/g, '');

/** Mismo formato que la regla de la base (coupons_code_chk). */
export const CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

/** Descuento en pesos para un subtotal de productos. Nunca mayor al subtotal. */
export function couponDiscount(type: CouponType, value: number, subtotal: number): number {
  if (!subtotal || subtotal <= 0 || !value || value <= 0) return 0;
  const raw = type === 'percent' ? subtotal * (Math.min(value, 100) / 100) : value;
  return round2(Math.min(raw, subtotal));
}

/** Texto corto del beneficio: "10 %" o "$150". */
export function couponLabel(type: CouponType, value: number): string {
  return type === 'percent'
    ? `${Number(value).toLocaleString('es-MX', { maximumFractionDigits: 2 })} %`
    : Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
}

const money = (n: number) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const REASON_TEXT: Record<string, string> = {
  not_found: 'Código no válido',
  inactive: 'Este código ya no está activo',
  not_started: 'Este código todavía no está vigente',
  expired: 'Este código ya venció',
  exhausted: 'Este código ya alcanzó su límite de usos',
  error: 'No se pudo validar el código. Intenta de nuevo.',
};

/**
 * Respaldo mientras no se ejecute la migración: si la función validate_coupon
 * no existe todavía, se acepta el cupón que antes estaba escrito en el código.
 */
const LEGACY: AppliedCoupon = { code: 'DESCUENTO202610', type: 'percent', value: 10, minSubtotal: 0 };

const isMissingFunction = (err: { code?: string }) => err.code === 'PGRST202' || err.code === '42883';

/** Pregunta a la base si el código aplica para este subtotal. */
export async function validateCoupon(rawCode: string, subtotal?: number): Promise<CouponCheck> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: 'not_found', message: REASON_TEXT.not_found };

  const { data, error } = await supabase.rpc('validate_coupon', {
    p_code: code,
    p_subtotal: typeof subtotal === 'number' ? round2(subtotal) : null,
  });

  if (error) {
    if (isMissingFunction(error)) {
      return code === LEGACY.code
        ? { ok: true, coupon: LEGACY }
        : { ok: false, reason: 'not_found', message: REASON_TEXT.not_found };
    }
    console.error('[validateCoupon]', error);
    return { ok: false, reason: 'error', message: REASON_TEXT.error };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.valid === true) {
    return {
      ok: true,
      coupon: {
        code: String(r.code),
        type: r.discount_type === 'fixed' ? 'fixed' : 'percent',
        value: Number(r.discount_value) || 0,
        minSubtotal: Number(r.min_subtotal) || 0,
      },
    };
  }
  const reason = String(r.reason || 'not_found');
  const message = reason === 'min_subtotal'
    ? `Este código aplica en compras desde ${money(Number(r.min_subtotal) || 0)}`
    : (REASON_TEXT[reason] ?? REASON_TEXT.not_found);
  return { ok: false, reason, message };
}

// ─── Admin ─────────────────────────────────────────────────────

export async function listCoupons(): Promise<{ data: Coupon[]; error: string | null }> {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((c) => ({
      ...c,
      discount_value: Number(c.discount_value),
      min_subtotal: Number(c.min_subtotal),
    })) as Coupon[],
    error: null,
  };
}

/** Crea (sin id) o actualiza (con id). Devuelve el cupón guardado o el mensaje de error. */
export async function saveCoupon(input: CouponInput, id?: string): Promise<{ data: Coupon | null; error: string | null }> {
  const payload = { ...input, code: normalizeCode(input.code) };
  const query = id
    ? supabase.from('coupons').update(payload).eq('id', id).select().single()
    : supabase.from('coupons').insert([payload]).select().single();
  const { data, error } = await query;
  if (error) {
    const msg = error.code === '23505'
      ? `Ya existe un cupón con el código ${payload.code}`
      : error.message;
    return { data: null, error: msg };
  }
  return { data: { ...data, discount_value: Number(data.discount_value), min_subtotal: Number(data.min_subtotal) } as Coupon, error: null };
}

export async function deleteCoupon(id: string): Promise<string | null> {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  return error ? error.message : null;
}

export async function setCouponActive(id: string, active: boolean): Promise<string | null> {
  const { error } = await supabase.from('coupons').update({ active }).eq('id', id);
  return error ? error.message : null;
}

export interface CouponUsage { uses: number; discount: number; sales: number }

/** Usos por código: solo pedidos pagados, enviados o entregados. */
export async function getCouponUsage(): Promise<Record<string, CouponUsage>> {
  const { data, error } = await supabase
    .from('orders')
    .select('coupon_code, discount_amount, total, status')
    .not('coupon_code', 'is', null)
    .in('status', ['paid', 'shipped', 'delivered']);
  if (error || !data) return {};
  const out: Record<string, CouponUsage> = {};
  for (const o of data as Array<{ coupon_code: string; discount_amount: number | null; total: number | null }>) {
    const key = normalizeCode(o.coupon_code || '');
    if (!key) continue;
    const u = (out[key] ??= { uses: 0, discount: 0, sales: 0 });
    u.uses += 1;
    u.discount += Number(o.discount_amount) || 0;
    u.sales += Number(o.total) || 0;
  }
  return out;
}

/** Código aleatorio legible (sin 0/O/1/I para evitar confusiones). */
export function generateCode(prefix = 'DIVINA'): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const tail = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${normalizeCode(prefix).replace(/[^A-Z0-9_-]/g, '') || 'DIVINA'}-${tail}`;
}

/** Estado legible de un cupón para el admin. */
export type CouponState = 'active' | 'paused' | 'scheduled' | 'expired' | 'exhausted';

export function couponState(c: Coupon, uses: number, now = Date.now()): CouponState {
  if (!c.active) return 'paused';
  if (c.ends_at && now >= new Date(c.ends_at).getTime()) return 'expired';
  if (c.max_uses != null && uses >= c.max_uses) return 'exhausted';
  if (c.starts_at && now < new Date(c.starts_at).getTime()) return 'scheduled';
  return 'active';
}
