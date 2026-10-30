/**
 * autoApi.ts — Panel ↔ /api/sourcing-auto y configuración de la automatización (store_config).
 */
import { supabase } from './supabase';
import { DEFAULT_MARGIN, DEFAULT_RULES, type MarginSettings, type PriceRules } from './sourcingCore.js';

export type AutoJob = 'check' | 'verify-order' | 'evaluate' | 'opportunities';

/** Llama a la función de automatización con la sesión del admin. */
export async function callAuto<T = unknown>(job: AutoJob, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Tu sesión venció. Vuelve a entrar.');
  const r = await fetch(`/api/sourcing-auto?job=${job}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let json: { ok?: boolean; error?: string } & Record<string, unknown> = {};
  try { json = await r.json(); } catch { /* respuesta vacía */ }
  if (!r.ok || json.ok === false) throw new Error(json.error || `Error ${r.status}`);
  return json as T;
}

export const AUTO_KEYS = {
  minMarginPct: 'auto_min_margin_pct',
  maxMarginPct: 'auto_max_margin_pct',
  minMarginMxn: 'auto_min_margin_mxn',
  undercutPct: 'auto_undercut_pct',
  maxChangePct: 'auto_max_change_pct',
  maxDeliveryDays: 'auto_max_delivery_days',
  checkHours: 'auto_check_hours',
} as const satisfies Record<keyof PriceRules, string>;

export const MARGIN_KEYS = {
  clipFeePct: 'sourcing_clip_fee_pct',
  clipFeeFixed: 'sourcing_clip_fee_fixed',
  ivaOnFee: 'sourcing_iva_on_fee',
  supplierShipping: 'sourcing_supplier_shipping',
  customerShipping: 'sourcing_customer_shipping',
} as const satisfies Record<keyof MarginSettings, string>;

export interface AutoConfig {
  rules: PriceRules;
  margin: MarginSettings;
  enabled: boolean;
  opportunitiesPerDay: number;
  seeds: string;
}

export async function loadAutoConfig(): Promise<AutoConfig> {
  const keys = [...Object.values(AUTO_KEYS), ...Object.values(MARGIN_KEYS), 'auto_enabled', 'auto_opportunities_per_day', 'auto_opportunity_seeds'];
  const { data } = await supabase.from('store_config').select('key,value').in('key', keys);
  const map = Object.fromEntries((data ?? []).map((r) => [r.key as string, String(r.value ?? '')]));
  const num = (k: string, d: number) => {
    const n = Number(map[k]);
    return map[k] !== undefined && map[k] !== '' && Number.isFinite(n) ? n : d;
  };
  const rules = Object.fromEntries(
    (Object.keys(AUTO_KEYS) as Array<keyof PriceRules>).map((k) => [k, num(AUTO_KEYS[k], DEFAULT_RULES[k])]),
  ) as unknown as PriceRules;
  return {
    rules,
    margin: {
      clipFeePct: num(MARGIN_KEYS.clipFeePct, DEFAULT_MARGIN.clipFeePct),
      clipFeeFixed: num(MARGIN_KEYS.clipFeeFixed, DEFAULT_MARGIN.clipFeeFixed),
      ivaOnFee: (map[MARGIN_KEYS.ivaOnFee] ?? 'true') !== 'false',
      supplierShipping: num(MARGIN_KEYS.supplierShipping, DEFAULT_MARGIN.supplierShipping),
      customerShipping: num(MARGIN_KEYS.customerShipping, DEFAULT_MARGIN.customerShipping),
    },
    enabled: (map.auto_enabled ?? 'true') !== 'false',
    opportunitiesPerDay: num('auto_opportunities_per_day', 6),
    seeds: map.auto_opportunity_seeds ?? '',
  };
}

export async function saveConfig(values: Record<string, string>): Promise<string | null> {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value }));
  const { error } = await supabase.from('store_config').upsert(rows, { onConflict: 'key' });
  return error ? error.message : null;
}

/** ¿Falta la migración de la automatización? (tabla o columna inexistente) */
export const isMissingSchema = (msg: string | null | undefined) =>
  !!msg && /schema cache|does not exist|column .* not exist|PGRST20[45]/i.test(msg);

export const moneyMx = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(Number(n))
    ? '—'
    : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });

export const shortDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
