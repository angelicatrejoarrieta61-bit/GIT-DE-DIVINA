/**
 * sourcing.ts — Lógica pura del buscador de proveedores (sin React, sin red).
 * Coincidencia de producto, detección de variantes/paquetes, marca y margen.
 */

// ─── Tipos ────────────────────────────────────────────────────
export type MatchLevel = 'exacta' | 'probable' | 'no_confirmada';
export type Trust = 'nuevo' | 'confiable' | 'descartado';

export interface SourcingOffer {
  id: string;
  merchant_id: string | null;
  shop: string;
  title: string;
  link: string | null;
  price_mxn: number | null;
  old_price_mxn: number | null;
  alt_price_text: string | null;
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
  times_seen: number;
  gives_invoice: boolean | null;
  shipping_days_min: number | null;
  shipping_days_max: number | null;
  shipping_cost_mxn: number | null;
  free_shipping_from_mxn: number | null;
  last_price?: number | null;
  last_seen_at?: string;
}

export interface MarginSettings {
  clipFeePct: number;      // % comisión Clip
  clipFeeFixed: number;    // MXN fijos por cobro
  ivaOnFee: boolean;       // IVA (16%) sobre la comisión
  supplierShipping: number;// envío estimado que pagas al proveedor
  customerShipping: number;// envío al cliente que absorbes
}

export const DEFAULT_MARGIN: MarginSettings = {
  clipFeePct: 3.6,
  clipFeeFixed: 0,
  ivaOnFee: true,
  supplierShipping: 0,
  customerShipping: 0,
};

export interface TargetSpec {
  brand: string | null;
  core: string[];          // palabras clave del producto (sin marca, tamaño ni SPF)
  forms: string[];         // crema, gel, fluido…
  strong: string[];        // color, pediatrics, kit…
  soft: string[];          // magic, repair, glow…
  sizeValue: number | null;
  sizeUnit: 'ml' | 'g' | 'oz' | null;
  spf: number | null;
  combo: boolean;          // la búsqueda misma es un combo ("A + B")
}

export interface EvaluatedOffer extends SourcingOffer {
  brand: string;
  match: MatchLevel;
  reasons: string[];
  costTotal: number | null;
  fee: number | null;
  margin: number | null;
  marginPct: number | null;
  priceFlag: 'sospechoso' | 'caro' | null;
  shipping: number;          // envío del proveedor por pieza usado en el costo
  shippingKnown: boolean;    // true si viene de los datos de la tienda
  shippingDays: string | null;
}

// ─── Diccionarios ─────────────────────────────────────────────
export const KNOWN_BRANDS: Array<{ name: string; keys: string[] }> = [
  { name: 'La Roche-Posay', keys: ['la roche posay', 'laroche posay', 'lrp', 'la roche'] },
  { name: 'ISDIN', keys: ['isdin'] },
  { name: 'Vichy', keys: ['vichy'] },
  { name: 'CeraVe', keys: ['cerave'] },
  { name: "Paula's Choice", keys: ['paulas choice', 'paula s choice'] },
  { name: 'Eucerin', keys: ['eucerin'] },
  { name: 'Bioderma', keys: ['bioderma'] },
  { name: 'Avène', keys: ['avene'] },
  { name: 'Neutrogena', keys: ['neutrogena'] },
  { name: 'Cetaphil', keys: ['cetaphil'] },
  { name: 'Sesderma', keys: ['sesderma'] },
  { name: 'Heliocare', keys: ['heliocare'] },
  { name: 'SkinCeuticals', keys: ['skinceuticals'] },
  { name: 'The Ordinary', keys: ['the ordinary'] },
  { name: 'Uriage', keys: ['uriage'] },
  { name: 'Nuxe', keys: ['nuxe'] },
  { name: 'Mustela', keys: ['mustela'] },
  { name: 'SVR', keys: ['svr'] },
  { name: 'Ducray', keys: ['ducray'] },
  { name: 'Filorga', keys: ['filorga'] },
  { name: "L'Oréal", keys: ['loreal', 'l oreal'] },
  { name: 'Garnier', keys: ['garnier'] },
  { name: 'Nivea', keys: ['nivea'] },
  { name: 'Dermaglós', keys: ['dermaglos'] },
  { name: 'Lierac', keys: ['lierac'] },
  { name: 'Caudalie', keys: ['caudalie'] },
];

/** Forma del producto: si tú buscas una y la oferta es otra, no es el mismo producto. */
const FORM_GROUPS: Record<string, string[]> = {
  crema: ['crema', 'cream', 'gel crema', 'gel-crema'],
  locion: ['locion', 'lotion', 'leche', 'milk', 'emulsion'],
  gel: ['gel'],
  fluido: ['fluido', 'fluid', 'fluide'],
  espuma: ['espuma', 'foam', 'mousse'],
  spray: ['spray', 'bruma', 'mist', 'aerosol'],
  stick: ['stick', 'barra'],
  serum: ['serum', 'suero'],
  aceite: ['aceite', 'oil'],
  agua: ['agua micelar', 'micelar', 'micellar'],
};

/** Variantes que cambian el producto (tono, edad, presentación). */
const STRONG_VARIANTS: Record<string, string[]> = {
  color: ['color', 'colour', 'tinted', 'tono', 'con color', 'teñido'],
  tono_light: ['light', 'ligth', 'claro'],
  tono_medium: ['medium', 'medio'],
  tono_dark: ['dark', 'oscuro'],
  tono_bronze: ['bronze', 'bronce'],
  pediatrics: ['pediatrics', 'pediatric', 'kids', 'ninos', 'infantil', 'dermo pediatrics', 'baby', 'bebe'],
  kit: ['kit', 'set', 'estuche', 'regalo'],
  refill: ['refill', 'recarga', 'repuesto'],
  corporal: ['corporal', 'body', 'cuerpo'],
};

/** Variantes de línea que pueden ser el mismo producto o no: requieren tu confirmación. */
const SOFT_VARIANTS = [
  'magic', 'glow', 'repair', 'age', 'ultra', 'invisible', 'oil control', 'antimanchas', 'anti pigment',
  'pigment', 'toque seco', 'dry touch', 'mat', 'matte', 'mate', 'hidratante', 'nocturna', 'noche',
  'dia', 'plus', 'pro', 'max', 'intense', 'intensivo', 'sensitive', 'sensible', 'acne', 'gel crema',
];

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'por', 'en', 'a', 'al', 'un', 'una',
  'protector', 'protectora', 'solar', 'fotoprotector', 'bloqueador', 'facial', 'rostro', 'piel',
  'tipo', 'todo', 'todos', 'mixta', 'grasa', 'seca', 'normal', 'muy', 'original', 'nuevo', 'nueva',
  'envio', 'gratis', 'ml', 'g', 'gr', 'grs', 'gramos', 'oz', 'spf', 'fps', 'pza', 'pieza', 'piezas', 'x',
  // Relleno de títulos tipo Amazon ("Ayuda a reducir la caída del cabello y estimula el crecimiento capilar")
  'ayuda', 'ayudar', 'reducir', 'reduce', 'estimula', 'estimular', 'crecimiento', 'cabello', 'capilar', 'caida',
  'mejora', 'ideal', 'hasta', 'horas', 'efecto', 'resultados', 'visible', 'visibles',
]);

// ─── Normalización ────────────────────────────────────────────
export function norm(s: string): string {
  return ` ${s}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\s*(ml|gr|grs|g|oz|onzas)\b/g, '$1 $2')
    .replace(/\bonzas?\b/g, 'oz')
    .replace(/\b(spf|fps|fp)\s*-?\s*(\d{2,3})\s*\+?/g, ' spf $2 ')
    .replace(/\b(moisturizing|moisturising|moisturiser|moisturizer)\b/g, 'hidratante')
    .replace(/\b(champu|champus|shampu|shampoos)\b/g, 'shampoo')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(^|[^\d])\.|\.(?!\d)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

export function detectBrand(title: string): string | null {
  const t = norm(title);
  for (const b of KNOWN_BRANDS) if (b.keys.some((k) => has(t, k))) return b.name;
  return null;
}

function parseSize(t: string): { value: number | null; unit: 'ml' | 'g' | 'oz' | null } {
  const m = t.match(/(\d+(?:\.\d+)?)\s(ml|gr|grs|g|oz|l)\b/);
  if (!m) return { value: null, unit: null };
  let value = Number(m[1]);
  const unit: 'ml' | 'g' | 'oz' = m[2] === 'oz' ? 'oz' : m[2] === 'ml' || m[2] === 'l' ? 'ml' : 'g';
  if (m[2] === 'l') value *= 1000;
  return { value, unit };
}

/** Equivalencia aproximada para comparar presentaciones (cremas: 1 ml ≈ 1 g; 1 oz ≈ 29.6 ml). */
function toBase(value: number, unit: 'ml' | 'g' | 'oz'): number {
  return unit === 'oz' ? value * 29.6 : value;
}

function parseSpf(t: string): number | null {
  const m = t.match(/\bspf (\d{2,3})\b/);
  return m ? Number(m[1]) : null;
}

function findGroups(t: string, groups: Record<string, string[]>): string[] {
  return Object.entries(groups)
    .filter(([, words]) => words.some((w) => has(t, w)))
    .map(([g]) => g);
}

/** Combo de dos productos en un anuncio: "Lambdacaps 30 cápsulas + Lambdapil champú". No cuenta "SPF 50+". */
const COMBO_RE = /[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1.')]\s*\+\s*[a-z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]/i;
export const isCombo = (title: string): boolean => COMBO_RE.test(title);

// ─── Especificación del producto buscado ─────────────────────
export function buildSpec(text: string, brandHint?: string | null): TargetSpec {
  const t = norm(text);
  const brand = brandHint?.trim() ? detectBrand(brandHint) ?? brandHint.trim() : detectBrand(text);
  const brandKeys = KNOWN_BRANDS.find((b) => b.name === brand)?.keys ?? (brand ? [norm(brand)] : []);
  const size = parseSize(t);
  const spf = parseSpf(t);
  const forms = findGroups(t, FORM_GROUPS);
  const strong = findGroups(t, STRONG_VARIANTS);
  const soft = SOFT_VARIANTS.filter((w) => has(t, w));

  let rest = ` ${t} `;
  for (const k of brandKeys) rest = rest.replace(` ${k} `, ' ');
  rest = rest.replace(/\bspf \d{2,3}\b/g, ' ').replace(/\d+(?:\.\d+)?\s(ml|gr|grs|g|oz|l)\b/g, ' ');
  const allVariantWords = [
    ...Object.values(FORM_GROUPS).flat(),
    ...Object.values(STRONG_VARIANTS).flat(),
    ...SOFT_VARIANTS,
  ];
  const core = rest
    .split(' ')
    .filter((w) => (w.length > 1 && !STOPWORDS.has(w) && !/^\d+(\.\d+)?$/.test(w)) || /^\d{3,}$/.test(w))
    .filter((w) => !allVariantWords.includes(w))
    .filter((w, i, arr) => w && arr.indexOf(w) === i);

  return { brand, core, forms, strong, soft, sizeValue: size.value, sizeUnit: size.unit, spf, combo: isCombo(text) };
}

export function isBarcode(q: string): boolean {
  return /^\d{8,14}$/.test(q.replace(/\s/g, ''));
}

// ─── Coincidencia ─────────────────────────────────────────────
export function classify(spec: TargetSpec, title: string): { match: MatchLevel; reasons: string[] } {
  const t = norm(title);
  const reasons: string[] = [];
  let hard = false;
  let soft = false;

  const specIsEmpty = !spec.brand && !spec.core.length && !spec.sizeValue && !spec.spf;
  if (specIsEmpty) return { match: 'probable', reasons: ['Búsqueda solo por código: confirma que sea tu producto'] };

  // Marca
  if (spec.brand) {
    const keys = KNOWN_BRANDS.find((b) => b.name === spec.brand)?.keys ?? [norm(spec.brand)];
    if (!keys.some((k) => has(t, k))) {
      const other = detectBrand(title);
      if (other) { hard = true; reasons.push(`Otra marca: ${other}`); }
      else { soft = true; reasons.push('No menciona la marca'); }
    }
  }

  // Palabras clave de la línea
  if (spec.core.length) {
    const found = spec.core.filter((w) => has(t, w));
    const missing = spec.core.filter((w) => !has(t, w));
    const ratio = found.length / spec.core.length;
    const brandMissing = spec.brand ? reasons.some((r) => r === 'No menciona la marca') : false;
    if (ratio < 0.5) { hard = true; reasons.push(`Faltan: ${missing.join(', ')}`); }
    else if (brandMissing && !has(t, spec.core[0])) { hard = true; reasons.push(`Sin marca ni línea (${spec.core[0]})`); }
    else if (missing.length) { soft = true; reasons.push(`No dice: ${missing.join(', ')}`); }
  }

  // Tamaño
  const size = parseSize(t);
  if (spec.sizeValue && spec.sizeUnit) {
    if (size.value === null || size.unit === null) { soft = true; reasons.push('No indica tamaño'); }
    else {
      const a = toBase(size.value, size.unit);
      const b = toBase(spec.sizeValue, spec.sizeUnit);
      const tolerance = size.unit === spec.sizeUnit ? 0.02 : 0.06;
      if (Math.abs(a - b) > b * tolerance) {
        hard = true; reasons.push(`Tamaño ${size.value} ${size.unit} (buscas ${spec.sizeValue} ${spec.sizeUnit})`);
      } else if (size.unit !== spec.sizeUnit) { soft = true; reasons.push(`Tamaño en ${size.unit}`); }
    }
  }

  // SPF
  const spf = parseSpf(t);
  if (spec.spf && spf && spf !== spec.spf) { hard = true; reasons.push(`SPF ${spf} (buscas ${spec.spf})`); }

  // Forma (crema vs gel vs fluido…)
  const forms = findGroups(t, FORM_GROUPS);
  if (spec.forms.length && forms.length && !forms.some((f) => spec.forms.includes(f))) {
    hard = true; reasons.push(`Es ${forms.join('/')}, no ${spec.forms.join('/')}`);
  }

  // Combo con otro producto (precio de dos productos juntos)
  if (!spec.combo && isCombo(title)) { hard = true; reasons.push('Combo: incluye otro producto'); }

  // Variantes fuertes (color, tono, pediátrico, kit, recarga)
  const strong = findGroups(t, STRONG_VARIANTS);
  const extraStrong = strong.filter((s) => !spec.strong.includes(s));
  const missingStrong = spec.strong.filter((s) => !strong.includes(s));
  if (extraStrong.length) { hard = true; reasons.push(`Variante: ${extraStrong.map(label).join(', ')}`); }
  if (missingStrong.length) { hard = true; reasons.push(`Sin: ${missingStrong.map(label).join(', ')}`); }

  // Variantes suaves (magic, repair, oil control…)
  const extraSoft = SOFT_VARIANTS.filter((w) => has(t, w) && !spec.soft.includes(w));
  const missingSoft = spec.soft.filter((w) => !has(t, w));
  if (extraSoft.length) { soft = true; reasons.push(`Incluye: ${extraSoft.join(', ')}`); }
  if (missingSoft.length) { soft = true; reasons.push(`Sin: ${missingSoft.join(', ')}`); }

  if (hard) return { match: 'no_confirmada', reasons };
  if (soft) return { match: 'probable', reasons };
  return { match: 'exacta', reasons: ['Coincide marca, línea, tamaño y variante'] };
}

function label(group: string): string {
  const map: Record<string, string> = {
    color: 'con color', tono_light: 'tono claro', tono_medium: 'tono medio', tono_dark: 'tono oscuro',
    tono_bronze: 'tono bronce', pediatrics: 'pediátrico', kit: 'kit/set', refill: 'recarga', corporal: 'corporal',
  };
  return map[group] ?? group;
}

// ─── Margen ───────────────────────────────────────────────────
export function clipFee(sale: number, s: MarginSettings): number {
  const base = sale * (s.clipFeePct / 100) + s.clipFeeFixed;
  return round2(s.ivaOnFee ? base * 1.16 : base);
}

export function computeMargin(sale: number | null, unitCost: number | null, s: MarginSettings, supplierShipping = s.supplierShipping) {
  if (unitCost === null) return { costTotal: null, fee: null, margin: null, marginPct: null };
  const costTotal = round2(unitCost + supplierShipping);
  if (!sale || sale <= 0) return { costTotal, fee: null, margin: null, marginPct: null };
  const fee = clipFee(sale, s);
  const margin = round2(sale - costTotal - fee - s.customerShipping);
  return { costTotal, fee, margin, marginPct: round2((margin / sale) * 100) };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─── Evaluación completa ──────────────────────────────────────
/** Envío que cobra una tienda para una oferta, según lo que capturaste en su ficha. */
export function merchantShipping(
  m: SourcingMerchant | undefined,
  offerPrice: number | null,
  packQty: number,
  fallback: number,
): { shipping: number; known: boolean; days: string | null } {
  const days = m?.shipping_days_min != null || m?.shipping_days_max != null
    ? (m?.shipping_days_min != null && m?.shipping_days_max != null && m.shipping_days_min !== m.shipping_days_max
      ? `${m.shipping_days_min}–${m.shipping_days_max} días`
      : `${m?.shipping_days_max ?? m?.shipping_days_min} día${(m?.shipping_days_max ?? m?.shipping_days_min) === 1 ? '' : 's'}`)
    : null;
  if (!m || m.shipping_cost_mxn == null) return { shipping: fallback, known: false, days };
  const free = m.free_shipping_from_mxn != null && offerPrice !== null && offerPrice >= m.free_shipping_from_mxn;
  const total = free ? 0 : Number(m.shipping_cost_mxn);
  return { shipping: round2(total / Math.max(1, packQty)), known: true, days };
}

export function evaluateOffers(
  offers: SourcingOffer[],
  spec: TargetSpec,
  salePrice: number | null,
  settings: MarginSettings,
  merchants: Record<string, SourcingMerchant> = {},
): EvaluatedOffer[] {
  const base = offers.map((o) => {
    const { match, reasons } = classify(spec, o.title);
    const ship = merchantShipping(o.merchant_id ? merchants[o.merchant_id] : undefined, o.price_mxn, o.pack_qty, settings.supplierShipping);
    const m = computeMargin(salePrice, o.unit_price_mxn, settings, ship.shipping);
    return {
      ...o,
      brand: detectBrand(o.title) ?? 'Otra',
      match,
      reasons: o.pack_qty > 1 ? [...reasons, `Paquete de ${o.pack_qty}: precio por pieza`] : reasons,
      ...m,
      priceFlag: null as EvaluatedOffer['priceFlag'],
      shipping: ship.shipping,
      shippingKnown: ship.known,
      shippingDays: ship.days,
    };
  });

  const ref = median(
    base.filter((o) => o.match !== 'no_confirmada' && o.unit_price_mxn).map((o) => o.unit_price_mxn as number),
  );
  if (ref) {
    for (const o of base) {
      if (o.unit_price_mxn === null) continue;
      if (o.unit_price_mxn < ref * 0.45) o.priceFlag = 'sospechoso';
      else if (o.unit_price_mxn > ref * 2.2) o.priceFlag = 'caro';
    }
  }
  return base;
}

export const MATCH_RANK: Record<MatchLevel, number> = { exacta: 0, probable: 1, no_confirmada: 2 };

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
