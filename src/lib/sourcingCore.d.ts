/** Tipos de src/lib/sourcingCore.js (JS puro para que también lo usen las funciones de Vercel). */

export type MatchLevel = 'exacta' | 'probable' | 'no_confirmada';
export type Trust = 'nuevo' | 'confiable' | 'descartado';

export interface CoreOffer {
  id?: string;
  merchant_id: string | null;
  shop: string;
  title: string;
  price_mxn: number | null;
  unit_price_mxn: number | null;
  pack_qty: number;
  alt_price_text?: string | null;
  is_installment?: boolean;
}

export interface CoreMerchant {
  trust?: Trust;
  authorized?: boolean;
  is_marketplace?: boolean;
  shipping_days_min?: number | null;
  shipping_days_max?: number | null;
  shipping_cost_mxn?: number | null;
  free_shipping_from_mxn?: number | null;
}

export interface MarginSettings {
  clipFeePct: number;
  clipFeeFixed: number;
  ivaOnFee: boolean;
  supplierShipping: number;
  customerShipping: number;
}

export interface PriceRules {
  minMarginPct: number;
  maxMarginPct: number;
  minMarginMxn: number;
  undercutPct: number;
  maxChangePct: number;
  maxDeliveryDays: number;
  checkHours: number;
}

export interface TargetSpec {
  brand: string | null;
  core: string[];
  forms: string[];
  strong: string[];
  soft: string[];
  sizeValue: number | null;
  sizeUnit: 'ml' | 'g' | 'oz' | null;
  spf: number | null;
  combo: boolean;
  packQty: number;
}

export interface EvaluatedFields {
  brand: string;
  match: MatchLevel;
  reasons: string[];
  installment: boolean;
  eligible: boolean;
  eligibility: string;
  own: boolean;
  costTotal: number | null;
  fee: number | null;
  margin: number | null;
  marginPct: number | null;
  priceFlag: 'sospechoso' | 'caro' | null;
  shipping: number;
  shippingKnown: boolean;
  shippingDays: string | null;
  discountPct: number | null;
}

export const KNOWN_BRANDS: Array<{ name: string; keys: string[] }>;
export const DEFAULT_MARGIN: MarginSettings;
export const DEFAULT_RULES: PriceRules;

export function norm(s: string): string;
export function normalizeKey(s: string): string;
export function round2(n: number): number;
export function detectBrand(title: string): string | null;
export function isCombo(title: string): boolean;
export function isBarcode(q: string): boolean;
export function looksLikeInstallment(text: string): boolean;
export function parsePrice(raw?: string | null): { value: number | null; installment: boolean; high?: number | null };
export function effectivePrice(o: { price_mxn: number | null; old_price_mxn?: number | null; alt_price_text?: string | null }): {
  price: number | null; original: number | null; discountPct: number | null;
};
export function queryFromUrl(raw: string): { query: string; code: string | null; shop: string } | null;
export function compactQuery(title: string): string;
export function parseMxn(raw?: string | null): number | null;
export function parsePackQty(title: string): number;
export function splitSeller(shop: string): { shop: string; seller: string | null };
export function buildSpec(text: string, brandHint?: string | null): TargetSpec;
export function classify(spec: TargetSpec, title: string, extraText?: string | null): { match: MatchLevel; reasons: string[] };
export function merchantShipping(
  m: CoreMerchant | undefined, offerPrice: number | null, packQty: number, fallback: number,
): { shipping: number; known: boolean; days: string | null };
export function merchantEligibility(m: CoreMerchant | undefined, maxDays?: number): { ok: boolean; reason: string };
export function isOwnShop(shop: string): boolean;
export function clipFee(sale: number, s: MarginSettings): number;
export function computeMargin(
  sale: number | null, unitCost: number | null, s: MarginSettings, supplierShipping?: number,
): { costTotal: number | null; fee: number | null; margin: number | null; marginPct: number | null };
export function floorPrice(unitCost: number, shipping: number, s: MarginSettings, rules: PriceRules): number;
export function targetPrice(args: { floor: number; market: number | null; current: number; rules: PriceRules }): {
  target: number; competitive: number | null; notes: string[];
};
export function priceAtMargin(cost: number, s: MarginSettings, pct: number): number;
export function bandPrice(args: { cost: number; prevCost?: number | null; current?: number | null; settings: MarginSettings; rules: PriceRules }): {
  target: number; lo: number; hi: number; mid: number; note: string | null;
};
export function shopKey(shop: string): string;
export function findTrackedOffer<O extends { shop: string; title: string; link?: string | null; unit_price_mxn: number | null; installment?: boolean; is_installment?: boolean }>(
  offers: O[], source: { shop: string; offer_title: string | null; link?: string | null } | null, query?: string | null,
): O | null;
export function evaluateAll<O extends CoreOffer>(
  offers: O[], spec: TargetSpec, salePrice: number | null, settings: MarginSettings,
  merchants?: Record<string, CoreMerchant>, maxDays?: number,
): {
  offers: Array<O & EvaluatedFields>;
  best: (O & EvaluatedFields) | null;
  marketLow: number | null;
  marketRef: number | null;
  shops: number;
  exactCount: number;
  reference: number | null;
};
