/**
 * sourcingCore.js — Lógica pura de abastecimiento (sin React, sin red, sin TypeScript).
 * La usan el panel (src/lib/sourcing.ts) y el servidor (api/sourcing-search.ts, api/sourcing-auto.ts),
 * así el comparador, la elegibilidad de proveedores y la regla de precio son idénticos en ambos lados.
 * JS puro (como seoRules.js) para que las funciones de Vercel lo importen sin compilar. Tipos: sourcingCore.d.ts
 */

// ─── Diccionarios ─────────────────────────────────────────────
export const KNOWN_BRANDS = [
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

/** Forma del producto: si buscas una y la oferta es otra, no es el mismo producto. */
const FORM_GROUPS = {
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
  capsulas: ['capsulas', 'caps', 'tabletas', 'comprimidos'],
};

/** Variantes que cambian el producto (tono, edad, presentación). */
const STRONG_VARIANTS = {
  color: ['color', 'colour', 'tinted', 'tono', 'con color', 'tenido'],
  tono_light: ['light', 'ligth', 'claro'],
  tono_medium: ['medium', 'medio'],
  tono_dark: ['dark', 'oscuro'],
  tono_bronze: ['bronze', 'bronce'],
  pediatrics: ['pediatrics', 'pediatric', 'kids', 'ninos', 'infantil', 'dermo pediatrics', 'baby', 'bebe'],
  kit: ['kit', 'set', 'estuche', 'regalo', 'coffret'],
  refill: ['refill', 'recarga', 'repuesto'],
  corporal: ['corporal', 'body', 'cuerpo'],
  mini: ['mini', 'travel', 'viaje', 'tamano viaje', 'miniatura'],
};

/** Nunca es una oferta válida para revender. */
const EXCLUDED = [
  ['usado', 'Usado'], ['usada', 'Usado'], ['seminuevo', 'Seminuevo'], ['reacondicionado', 'Reacondicionado'],
  ['replica', 'Réplica'], ['imitacion', 'Imitación'], ['generico', 'Genérico'], ['tester', 'Tester'],
  ['muestra', 'Muestra'], ['sample', 'Muestra'], ['decant', 'Decant'], ['sin caja', 'Sin caja'],
  ['caja danada', 'Caja dañada'], ['caducado', 'Caducado'], ['proximo a caducar', 'Próximo a caducar'],
];

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
  'ayuda', 'ayudar', 'reducir', 'reduce', 'estimula', 'estimular', 'crecimiento', 'cabello', 'capilar', 'caida',
  'mejora', 'ideal', 'hasta', 'horas', 'efecto', 'resultados', 'visible', 'visibles',
]);

// ─── Normalización ────────────────────────────────────────────
export function norm(s) {
  return ` ${s ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’`´]/g, '')
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

/** Clave de texto simple (minúsculas, sin acentos, espacios simples). */
export function normalizeKey(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (text, phrase) => ` ${text} `.includes(` ${phrase} `);
export const round2 = (n) => Math.round(n * 100) / 100;

export function detectBrand(title) {
  const t = norm(title);
  for (const b of KNOWN_BRANDS) if (b.keys.some((k) => has(t, k))) return b.name;
  return null;
}

function parseSize(t) {
  const m = t.match(/(\d+(?:\.\d+)?)\s(ml|gr|grs|g|oz|l)\b/);
  if (!m) return { value: null, unit: null };
  let value = Number(m[1]);
  const unit = m[2] === 'oz' ? 'oz' : m[2] === 'ml' || m[2] === 'l' ? 'ml' : 'g';
  if (m[2] === 'l') value *= 1000;
  return { value, unit };
}

/** Equivalencia aproximada (cremas: 1 ml ≈ 1 g; 1 oz ≈ 29.6 ml). */
const toBase = (value, unit) => (unit === 'oz' ? value * 29.6 : value);

function parseSpf(t) {
  const m = t.match(/\bspf (\d{2,3})\b/);
  return m ? Number(m[1]) : null;
}

function findGroups(t, groups) {
  return Object.entries(groups)
    .filter(([, words]) => words.some((w) => has(t, w)))
    .map(([g]) => g);
}

/** Combo de dos productos: "Lambdacaps 30 cápsulas + Lambdapil champú". No cuenta "SPF 50+". */
const COMBO_RE = /[a-záéíóúñ.')]\s*\+\s*[a-z0-9áéíóúñ]/i;
export const isCombo = (title) => COMBO_RE.test(title ?? '');

export const isBarcode = (q) => /^\d{8,14}$/.test(String(q ?? '').replace(/\s/g, ''));

// ─── Precios, mensualidades y paquetes ────────────────────────
/** Texto de mensualidad: "12 x $45", "$45/mes", "3 MSI", "pagos quincenales"… */
const INSTALLMENT_RE = /(\b\d{1,2}\s*x\s*\$)|(\b\d{1,2}\s*(?:meses|msi|pagos|quincenas|mensualidades)\b)|(\/\s*mes\b)|\bal mes\b|\bmensual(?:es|idad(?:es)?)?\b|\bsemanal(?:es)?\b|\bquincenal(?:es)?\b|\bmeses sin intereses\b/i;
export const looksLikeInstallment = (text) => INSTALLMENT_RE.test(normalizeKey(text));

/**
 * Lee un precio en pesos. Prefiere el número que sigue a "$".
 * "12 x $45.00" → total 540 (12 pagos), installment = true.
 * "$45/mes" sin número de pagos → value null, installment = true (no se sabe el total).
 */
export function parsePrice(raw) {
  if (!raw) return { value: null, installment: false };
  const text = String(raw);
  const num = (s) => {
    const m = s.replace(/\s/g, '').match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/);
    if (!m) return null;
    const n = Number(`${m[1].replace(/,/g, '')}.${m[2] ?? '0'}`);
    return Number.isFinite(n) && n > 0 ? round2(n) : null;
  };
  const installment = looksLikeInstallment(text);
  const afterDollar = text.match(/\$\s*([\d.,]+)/);
  const amount = afterDollar ? num(afterDollar[1]) : num(text);
  if (!installment) return { value: amount, installment: false };
  const n = normalizeKey(text).match(/\b(\d{1,2})\s*(?:x\s*(?=\$)|meses\b|msi\b|pagos\b|quincenas\b|mensualidades\b)/);
  if (n && amount !== null && afterDollar) return { value: round2(amount * Number(n[1])), installment: true };
  return { value: null, installment: true };
}

/** Compatibilidad: solo el número. */
export const parseMxn = (raw) => parsePrice(raw).value;

/** Piezas en el anuncio: "2 piezas", "pack de 3", "paquete 6", "2x50 ml", "x2", "trío". */
export function parsePackQty(title) {
  const t = normalizeKey(title);
  const patterns = [
    /\b(\d{1,2})\s*(?:piezas|pzas|pzs|pz|pcs|pc|unidades|uds|frascos|tubos|botellas|envases)\b/,
    /\b(?:pack|paquete|kit|set|duo|trio|combo)\s*(?:de|x|con)?\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s*(?:pack|paquete)\b/,
    /\b(\d{1,2})\s*x\s*\d+(?:[.,]\d+)?\s*(?:ml|g|gr|oz)\b/,
    /(?:^|\s)x\s*(\d)(?:\s|$)/,
    /(?:^|\s)(\d)\s*x(?:\s|$)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const q = Number(m[1]);
      if (q >= 2 && q <= 24) return q;
    }
  }
  if (/\btrio\b/.test(t)) return 3;
  if (/\bduo\b/.test(t)) return 2;
  return 1;
}

/**
 * Tienda y vendedor de un anuncio de marketplace.
 * "Amazon.com.mx - Vendedor X" / "Mercado Libre · Tienda Oficial X" / "X (vendido por Amazon)".
 */
export function splitSeller(shop) {
  const s = String(shop ?? '').trim();
  const m = s.match(/^(.+?)\s+(?:-|·|\||–)\s+(.+)$/);
  if (m) return { shop: m[1].trim(), seller: m[2].trim() };
  const v = s.match(/^(.+?)\s*\(?\s*vendido por\s+(.+?)\)?$/i);
  if (v) return { shop: v[2].trim(), seller: v[1].trim() };
  return { shop: s, seller: null };
}

// ─── Especificación del producto buscado ─────────────────────
export function buildSpec(text, brandHint) {
  const t = norm(text);
  const hint = typeof brandHint === 'string' ? brandHint.trim() : '';
  const brand = hint ? detectBrand(hint) ?? hint : detectBrand(text);
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

  return {
    brand, core, forms, strong, soft,
    sizeValue: size.value, sizeUnit: size.unit, spf,
    combo: isCombo(text),
    packQty: parsePackQty(text),
  };
}

function label(group) {
  const map = {
    color: 'con color', tono_light: 'tono claro', tono_medium: 'tono medio', tono_dark: 'tono oscuro',
    tono_bronze: 'tono bronce', pediatrics: 'pediátrico', kit: 'kit/set', refill: 'recarga', corporal: 'corporal',
    mini: 'tamaño mini/viaje',
  };
  return map[group] ?? group;
}

// ─── Coincidencia ─────────────────────────────────────────────
/**
 * Compara un anuncio contra el producto buscado.
 * Exacta: misma marca, línea, tamaño, SPF, forma y variante, sin combo ni mensualidad.
 * El paquete (2, 3 piezas) NO cambia la coincidencia: se compara por pieza.
 */
export function classify(spec, title, extraText) {
  const t = norm(title);
  const reasons = [];
  let hard = false;
  let soft = false;

  const specIsEmpty = !spec.brand && !spec.core.length && !spec.sizeValue && !spec.spf;
  if (specIsEmpty) return { match: 'probable', reasons: ['Búsqueda solo por código: confirma que sea tu producto'] };

  for (const [w, lbl] of EXCLUDED) {
    if (has(t, w)) { hard = true; reasons.push(lbl); }
  }

  void extraText; // el precio alterno (alt_price_text) se avisa aparte; aquí solo cuenta el título
  if (looksLikeInstallment(title)) {
    hard = true; reasons.push('Precio en mensualidades');
  }

  if (spec.brand) {
    const keys = KNOWN_BRANDS.find((b) => b.name === spec.brand)?.keys ?? [norm(spec.brand)];
    if (!keys.some((k) => has(t, k))) {
      const other = detectBrand(title);
      if (other) { hard = true; reasons.push(`Otra marca: ${other}`); }
      else { soft = true; reasons.push('No menciona la marca'); }
    }
  }

  if (spec.core.length) {
    const found = spec.core.filter((w) => has(t, w));
    const missing = spec.core.filter((w) => !has(t, w));
    const ratio = found.length / spec.core.length;
    const brandMissing = spec.brand ? reasons.includes('No menciona la marca') : false;
    if (ratio < 0.5) { hard = true; reasons.push(`Faltan: ${missing.join(', ')}`); }
    else if (brandMissing && !has(t, spec.core[0])) { hard = true; reasons.push(`Sin marca ni línea (${spec.core[0]})`); }
    else if (missing.length) { soft = true; reasons.push(`No dice: ${missing.join(', ')}`); }
  }

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

  const spf = parseSpf(t);
  if (spec.spf && spf && spf !== spec.spf) { hard = true; reasons.push(`SPF ${spf} (buscas ${spec.spf})`); }

  const forms = findGroups(t, FORM_GROUPS);
  if (spec.forms.length && forms.length && !forms.some((f) => spec.forms.includes(f))) {
    hard = true; reasons.push(`Es ${forms.join('/')}, no ${spec.forms.join('/')}`);
  }

  if (!spec.combo && isCombo(title)) { hard = true; reasons.push('Combo: incluye otro producto'); }

  const strong = findGroups(t, STRONG_VARIANTS);
  const pack = parsePackQty(title);
  // "kit/set de 2" del mismo producto es un paquete, no otra variante
  const extraStrong = strong.filter((s) => !spec.strong.includes(s) && !(s === 'kit' && pack > 1 && !isCombo(title)));
  const missingStrong = spec.strong.filter((s) => !strong.includes(s));
  if (extraStrong.length) { hard = true; reasons.push(`Variante: ${extraStrong.map(label).join(', ')}`); }
  if (missingStrong.length) { hard = true; reasons.push(`Sin: ${missingStrong.map(label).join(', ')}`); }

  const extraSoft = SOFT_VARIANTS.filter((w) => has(t, w) && !spec.soft.includes(w));
  const missingSoft = spec.soft.filter((w) => !has(t, w));
  if (extraSoft.length) { soft = true; reasons.push(`Incluye: ${extraSoft.join(', ')}`); }
  if (missingSoft.length) { soft = true; reasons.push(`Sin: ${missingSoft.join(', ')}`); }

  if (hard) return { match: 'no_confirmada', reasons };
  if (soft) return { match: 'probable', reasons };
  return { match: 'exacta', reasons: ['Coincide marca, línea, tamaño y variante'] };
}

// ─── Proveedores ──────────────────────────────────────────────
/** Envío del proveedor por pieza y días de entrega, según la ficha de la tienda. */
export function merchantShipping(m, offerPrice, packQty, fallback) {
  const min = m?.shipping_days_min ?? null;
  const max = m?.shipping_days_max ?? null;
  const days = min != null || max != null
    ? (min != null && max != null && min !== max
      ? `${min}–${max} días`
      : `${max ?? min} día${(max ?? min) === 1 ? '' : 's'}`)
    : null;
  if (!m || m.shipping_cost_mxn == null) return { shipping: fallback, known: false, days };
  const free = m.free_shipping_from_mxn != null && offerPrice !== null && offerPrice >= Number(m.free_shipping_from_mxn);
  const total = free ? 0 : Number(m.shipping_cost_mxn);
  return { shipping: round2(total / Math.max(1, packQty)), known: true, days };
}

/**
 * ¿Se le puede comprar a esta tienda?
 * Empresa grande autorizada, no descartada, que entregue en `maxDays` días (1 = día siguiente).
 */
export function merchantEligibility(m, maxDays = 1) {
  if (!m) return { ok: false, reason: 'Tienda sin registrar' };
  if (m.trust === 'descartado') return { ok: false, reason: 'Tienda descartada' };
  if (!m.authorized) return { ok: false, reason: 'No es proveedor autorizado' };
  const days = m.shipping_days_max ?? m.shipping_days_min ?? null;
  if (days == null) return { ok: false, reason: 'Falta capturar días de entrega' };
  if (Number(days) > maxDays) return { ok: false, reason: `Entrega en ${days} días` };
  return { ok: true, reason: maxDays <= 1 ? 'Autorizada · entrega al día siguiente' : `Autorizada · entrega en ${days} día${days === 1 ? '' : 's'}` };
}

/** Tienda propia: nunca cuenta como competencia ni como proveedor. */
export const isOwnShop = (shop) => /\bdivina\b/.test(normalizeKey(shop));

// ─── Margen y precio ──────────────────────────────────────────
export function clipFee(sale, s) {
  const base = sale * (s.clipFeePct / 100) + s.clipFeeFixed;
  return round2(s.ivaOnFee ? base * 1.16 : base);
}

export function computeMargin(sale, unitCost, s, supplierShipping = s.supplierShipping) {
  if (unitCost === null || unitCost === undefined) return { costTotal: null, fee: null, margin: null, marginPct: null };
  const costTotal = round2(unitCost + supplierShipping);
  if (!sale || sale <= 0) return { costTotal, fee: null, margin: null, marginPct: null };
  const fee = clipFee(sale, s);
  const margin = round2(sale - costTotal - fee - s.customerShipping);
  return { costTotal, fee, margin, marginPct: round2((margin / sale) * 100) };
}

/**
 * Precio mínimo que deja tu ganancia: ≥ minPct % del precio Y ≥ minMxn pesos,
 * después de costo, envío del proveedor, envío que absorbes y comisión de Clip (con IVA).
 */
export function floorPrice(unitCost, shipping, s, rules) {
  const iva = s.ivaOnFee ? 1.16 : 1;
  const feeRate = (s.clipFeePct / 100) * iva;
  const feeFixed = s.clipFeeFixed * iva;
  const base = unitCost + shipping + s.customerShipping + feeFixed;
  const byPct = base / Math.max(0.05, 1 - feeRate - rules.minMarginPct / 100);
  const byMxn = (base + rules.minMarginMxn) / Math.max(0.05, 1 - feeRate);
  return Math.ceil(Math.max(byPct, byMxn));
}

/**
 * Precio objetivo:
 *  - nunca debajo del piso (tu ganancia mínima);
 *  - con precio de mercado: un poco debajo del precio típico (mediana de las otras tiendas, undercut %);
 *    así sube cuando el mercado sube y baja cuando el mercado baja, sin perder tu mínimo;
 *  - sin dato de mercado: conserva el precio actual (solo sube si el piso lo exige);
 *  - tope de cambio por revisión, salvo cuando el piso obliga a subir.
 * (No se usa el más barato: ese suele ser tu propio proveedor y quedarías siempre en el piso.)
 */
export function targetPrice({ floor, market, current, rules }) {
  const competitive = market ? Math.floor(market * (1 - rules.undercutPct / 100)) : null;
  let target = competitive !== null ? Math.max(floor, competitive) : Math.max(floor, current || floor);
  const notes = [];
  if (competitive !== null && competitive < floor) notes.push('El mercado está por debajo de tu ganancia mínima');
  if (current > 0 && rules.maxChangePct > 0) {
    const up = Math.floor(current * (1 + rules.maxChangePct / 100));
    const down = Math.ceil(current * (1 - rules.maxChangePct / 100));
    if (target > up && target > floor) { target = Math.max(up, floor); notes.push(`Subida limitada a ${rules.maxChangePct}%`); }
    if (target < down) { target = Math.max(down, floor); notes.push(`Bajada limitada a ${rules.maxChangePct}%`); }
  }
  return { target, competitive, notes };
}

export const DEFAULT_MARGIN = { clipFeePct: 3.6, clipFeeFixed: 0, ivaOnFee: true, supplierShipping: 0, customerShipping: 0 };
export const DEFAULT_RULES = { minMarginPct: 25, minMarginMxn: 100, undercutPct: 2, maxChangePct: 35, maxDeliveryDays: 1, checkHours: 5 };

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Evalúa todas las ofertas de una búsqueda contra el producto.
 * Devuelve cada oferta con coincidencia, elegibilidad del proveedor, costo y margen,
 * más el mejor proveedor elegible y el precio más bajo del mercado (mismo producto exacto).
 */
export function evaluateAll(offers, spec, salePrice, settings, merchants = {}, maxDays = 1) {
  const base = offers.map((o) => {
    const installment = Boolean(o.is_installment) || looksLikeInstallment(o.title);
    const { match: rawMatch, reasons } = classify(spec, o.title, o.alt_price_text);
    const match = installment && rawMatch === 'exacta' ? 'probable' : rawMatch;
    const m = o.merchant_id ? merchants[o.merchant_id] : undefined;
    const ship = merchantShipping(m, o.price_mxn, o.pack_qty, settings.supplierShipping);
    const elig = merchantEligibility(m, maxDays);
    const mm = computeMargin(salePrice, o.unit_price_mxn, settings, ship.shipping);
    const extra = [];
    if (o.pack_qty > 1) extra.push(`Paquete de ${o.pack_qty}: precio por pieza`);
    if (installment && !reasons.includes('Precio en mensualidades')) extra.push('Precio en mensualidades: confirma el total');
    return {
      ...o,
      brand: detectBrand(o.title) ?? 'Otra',
      match,
      reasons: [...reasons, ...extra],
      installment,
      eligible: elig.ok,
      eligibility: elig.reason,
      own: isOwnShop(o.shop),
      ...mm,
      priceFlag: null,
      shipping: ship.shipping,
      shippingKnown: ship.known,
      shippingDays: ship.days,
    };
  });

  const ref = median(
    base.filter((o) => o.match !== 'no_confirmada' && o.unit_price_mxn && !o.installment && !o.own).map((o) => o.unit_price_mxn),
  );
  if (ref) {
    for (const o of base) {
      if (o.unit_price_mxn === null) continue;
      if (o.unit_price_mxn < ref * 0.45) o.priceFlag = 'sospechoso';
      else if (o.unit_price_mxn > ref * 2.2) o.priceFlag = 'caro';
    }
  }

  const clean = base.filter((o) => o.match === 'exacta' && o.unit_price_mxn !== null && !o.installment && o.priceFlag !== 'sospechoso' && !o.own);
  const marketLow = clean.length ? Math.min(...clean.map((o) => o.unit_price_mxn)) : null;
  const best = clean
    .filter((o) => o.eligible)
    .sort((a, b) => (a.unit_price_mxn + a.shipping) - (b.unit_price_mxn + b.shipping))[0] ?? null;
  // Precio típico del mercado: mediana de las tiendas que venden el mismo producto (una por tienda, la más barata)
  const perShop = new Map();
  for (const o of clean) {
    const k = normalizeKey(o.shop);
    if (!perShop.has(k) || perShop.get(k) > o.unit_price_mxn) perShop.set(k, o.unit_price_mxn);
  }
  const marketRef = perShop.size >= 2 ? round2(median([...perShop.values()])) : null;

  return { offers: base, best, marketLow, marketRef, shops: perShop.size, exactCount: clean.length, reference: ref };
}
