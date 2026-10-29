/**
 * sourcing.ts — Tipos y utilidades del buscador de proveedores para el panel.
 * La lógica (coincidencia, mensualidades, paquetes, proveedores autorizados, margen y precio)
 * vive en sourcingCore.js y es la misma que usa el servidor.
 */
import {
  evaluateAll,
  type EvaluatedFields,
  type MarginSettings,
  type MatchLevel,
  type TargetSpec,
  type Trust,
} from './sourcingCore.js';

export {
  KNOWN_BRANDS, DEFAULT_MARGIN, DEFAULT_RULES,
  norm, normalizeKey, round2, detectBrand, isCombo, isBarcode, looksLikeInstallment, parsePrice, parseMxn, parsePackQty,
  splitSeller, buildSpec, classify, merchantShipping, merchantEligibility, isOwnShop, clipFee, computeMargin,
  floorPrice, targetPrice, evaluateAll,
} from './sourcingCore.js';
export type { MatchLevel, Trust, MarginSettings, TargetSpec, PriceRules } from './sourcingCore.js';

// ─── Tipos ────────────────────────────────────────────────────
export interface SourcingOffer {
  id: string;
  merchant_id: string | null;
  shop: string;
  seller?: string | null;
  title: string;
  link: string | null;
  price_mxn: number | null;
  old_price_mxn: number | null;
  alt_price_text: string | null;
  is_installment?: boolean;
  pack_qty: number;
  unit_price_mxn: number | null;
  rating: number | null;
  reviews: number | null;
  thumbnail: string | null;
  position: number;
  fetched_at: string;
}

export interface SourcingMerchant {
  id: string;
  name: string;
  trust: Trust;
  website: string | null;
  notes: string | null;
  conditions?: string | null;
  times_seen: number;
  gives_invoice: boolean | null;
  authorized?: boolean;
  is_marketplace?: boolean;
  shipping_days_min: number | null;
  shipping_days_max: number | null;
  shipping_cost_mxn: number | null;
  free_shipping_from_mxn: number | null;
  last_price?: number | null;
  last_seen_at?: string;
}

export type EvaluatedOffer = SourcingOffer & EvaluatedFields;

/** Evalúa las ofertas de una búsqueda (ver evaluateAll en sourcingCore.js). */
export function evaluateOffers(
  offers: SourcingOffer[],
  spec: TargetSpec,
  salePrice: number | null,
  settings: MarginSettings,
  merchants: Record<string, SourcingMerchant> = {},
  maxDays = 1,
): EvaluatedOffer[] {
  return evaluateAll(offers, spec, salePrice, settings, merchants, maxDays).offers;
}

export const MATCH_RANK: Record<MatchLevel, number> = { exacta: 0, probable: 1, no_confirmada: 2 };

// ─── Utilidades de presentación ───────────────────────────────
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 90);
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace segundos';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

/** Dominio limpio de un sitio ("https://www.tienda.com/x" → "tienda.com"). */
export function domainOf(website: string | null | undefined): string | null {
  if (!website) return null;
  const m = website.trim().toLowerCase().match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/);
  return m ? m[1] : null;
}

/** Enlace para verificar un producto dentro del sitio de la tienda (búsqueda acotada a su dominio). */
export function verifyUrl(website: string | null | undefined, title: string): string | null {
  const d = domainOf(website);
  if (!d) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${d} ${title}`)}`;
}
