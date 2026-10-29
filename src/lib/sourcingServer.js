/**
 * sourcingServer.js — Código de servidor compartido por api/sourcing-search.ts y api/sourcing-auto.ts.
 * Google Shopping MX vía Bright Data (zona SERP), directorio de tiendas, histórico de ofertas,
 * revisión automática de productos, regla de precio y verificación de pedidos.
 * JS puro (ESM) para que las funciones de Vercel lo importen sin compilar. Solo corre en el servidor.
 */
import {
  normalizeKey, parsePrice, parseMxn, parsePackQty, splitSeller, buildSpec, evaluateAll,
  floorPrice, targetPrice, computeMargin, round2, DEFAULT_MARGIN, DEFAULT_RULES,
} from './sourcingCore.js';

const BRIGHTDATA_TIMEOUT_MS = 55_000;
const MAX_THUMB_CHARS = 24_000;

/** Sitios de tiendas conocidas en México. */
const KNOWN_SITES = {
  'mercado libre': 'https://www.mercadolibre.com.mx',
  'amazon mx': 'https://www.amazon.com.mx',
  amazon: 'https://www.amazon.com.mx',
  liverpool: 'https://www.liverpool.com.mx',
  'farmacias del ahorro': 'https://www.fahorro.com',
  'san pablo farmacia': 'https://www.farmaciasanpablo.com.mx',
  'farmacia san pablo': 'https://www.farmaciasanpablo.com.mx',
  'farmacias benavides': 'https://www.benavides.com.mx',
  'farmacias guadalajara': 'https://www.farmaciasguadalajara.com',
  chedraui: 'https://www.chedraui.com.mx',
  soriana: 'https://www.soriana.com',
  'el palacio de hierro': 'https://www.elpalaciodehierro.com',
  sephora: 'https://www.sephora.com.mx',
  "sam's club": 'https://www.sams.com.mx',
  'sams club': 'https://www.sams.com.mx',
  'bodega aurrera': 'https://www.bodegaaurrera.com.mx',
  walmart: 'https://www.walmart.com.mx',
  costco: 'https://www.costco.com.mx',
  sanborns: 'https://www.sanborns.com.mx',
  coppel: 'https://www.coppel.com',
  isdin: 'https://www.isdin.com',
};

/** Empresas grandes que se marcan como autorizadas la primera vez que aparecen. */
const AUTHORIZED_KEYS = new Set([
  'amazon mx', 'amazon', 'amazon.com.mx', 'mercado libre', 'mercadolibre', 'liverpool', 'el palacio de hierro',
  'sephora', 'sanborns', 'walmart', 'walmart.com.mx', 'bodega aurrera', "sam's club", 'sams club', 'costco',
  'chedraui', 'soriana', 'farmacias del ahorro', 'san pablo farmacia', 'farmacia san pablo', 'farmacias benavides',
  'farmacias guadalajara', 'coppel', 'isdin',
]);
const MARKETPLACE_KEYS = new Set(['amazon mx', 'amazon', 'amazon.com.mx', 'mercado libre', 'mercadolibre', 'walmart', 'walmart.com.mx', 'coppel', 'liverpool']);

export function guessWebsite(shopName) {
  const key = normalizeKey(shopName);
  if (KNOWN_SITES[key]) return KNOWN_SITES[key];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|mx|com\.mx|net|org|store|shop)$/.test(key)) return `https://${key.startsWith('www.') ? key : `www.${key}`}`;
  return null;
}

// ─── Google Shopping vía Bright Data ──────────────────────────
async function fetchSerp(params) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_SERP_ZONE || 'divina_serp';
  if (!apiKey) throw new Error('Falta BRIGHTDATA_API_KEY en Vercel.');
  const target = `https://www.google.com/search?${params.toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BRIGHTDATA_TIMEOUT_MS);
  try {
    const r = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ zone, url: target, format: 'json', data_format: 'parsed' }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Bright Data respondió ${r.status}`);
    const wrapper = await r.json();
    if (wrapper.status_code && wrapper.status_code >= 400) {
      const code = wrapper.headers?.['x-brd-error-code'] || wrapper.headers?.['x-brd-error'] || wrapper.status_code;
      throw new Error(`Google no respondió (${code})`);
    }
    return typeof wrapper.body === 'string' ? JSON.parse(wrapper.body || '{}') : (wrapper.body ?? {});
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('La búsqueda tardó demasiado. Intenta de nuevo.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Productos de una página: carrusel patrocinado (top/jackpot/bottom_pla) y pestaña Shopping. */
function productsOf(body) {
  const out = [];
  for (const key of ['top_pla', 'jackpot_pla', 'shopping', 'bottom_pla']) {
    const list = body[key];
    if (!Array.isArray(list)) continue;
    for (const it of list) {
      if (!it || it.view_all) continue;
      out.push(it);
    }
  }
  return out;
}

/** Búsqueda normal (patrocinados) + pestaña Shopping (udm=28), sin duplicados. */
export async function fetchShopping(query, start = 0) {
  const base = { q: query, gl: 'mx', hl: 'es-419' };
  const shopParams = new URLSearchParams({ ...base, udm: '28' });
  if (start > 0) shopParams.set('start', String(start));
  const [web, shop] = await Promise.allSettled([
    start === 0 ? fetchSerp(new URLSearchParams(base)) : Promise.resolve({}),
    fetchSerp(shopParams),
  ]);
  if (web.status === 'rejected' && shop.status === 'rejected') throw shop.reason;

  const webItems = web.status === 'fulfilled' ? productsOf(web.value) : [];
  const shopItems = shop.status === 'fulfilled' ? productsOf(shop.value) : [];
  const sources = {
    sponsored: webItems.length,
    shopping: shopItems.length,
    sponsoredError: web.status === 'rejected' ? String(web.reason?.message || web.reason).slice(0, 160) : null,
    shoppingError: shop.status === 'rejected' ? String(shop.reason?.message || shop.reason).slice(0, 160) : null,
  };
  const seen = new Set();
  const items = [];
  for (const it of [...webItems, ...shopItems]) {
    if (!it.title || !it.shop) continue;
    const key = `${normalizeKey(it.shop)}|${normalizeKey(it.title).slice(0, 80)}|${parseMxn(it.price) ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }
  const shopBody = shop.status === 'fulfilled' ? shop.value : null;
  const nextStart = typeof shopBody?.pagination?.next_page_start === 'number' ? shopBody.pagination.next_page_start : null;
  return { items, nextStart, sources };
}

function altPriceText(item, main) {
  const parts = (item.price_details ?? [])
    .map((d) => (d.price ?? '').trim())
    .filter(Boolean)
    .filter((p) => {
      const n = parseMxn(p);
      return n === null || main === null || Math.abs(n - main) > 0.5;
    });
  return parts.length ? parts.join(' · ').slice(0, 120) : null;
}

/** Ofertas listas para guardar: precio, mensualidad, paquete, vendedor. */
export function normalizeItems(items, start = 0) {
  return items
    .filter((it) => it.title && it.shop)
    .map((it, i) => {
      const parsed = parsePrice(it.price);
      const price = parsed.value;
      const pack = parsePackQty(it.title);
      const { seller } = splitSeller(it.shop);
      const thumb = typeof it.image === 'string' && it.image.startsWith('data:image/') && it.image.length <= MAX_THUMB_CHARS ? it.image : null;
      return {
        shop: it.shop.trim(),
        title: it.title.trim(),
        link: it.link && /^https:\/\//.test(it.link) ? it.link : null,
        price_mxn: price,
        old_price_mxn: parseMxn(it.old_price),
        alt_price_text: altPriceText(it, price),
        is_installment: parsed.installment,
        seller,
        pack_qty: pack,
        unit_price_mxn: price !== null ? round2(price / pack) : null,
        rating: typeof it.rating === 'number' ? it.rating : null,
        reviews: typeof it.reviews_cnt === 'number' ? it.reviews_cnt : null,
        thumbnail: thumb,
        position: start + i + 1,
      };
    });
}

/** Actualiza el directorio de tiendas; las grandes conocidas quedan autorizadas desde que aparecen. */
export async function upsertMerchants(db, items) {
  const byKey = new Map();
  for (const it of items) {
    const key = normalizeKey(it.shop);
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) {
      prev.count += 1;
      if (it.price !== null && (prev.price === null || it.price < prev.price)) prev.price = it.price;
    } else {
      byKey.set(key, { name: it.shop, price: it.price, count: 1 });
    }
  }
  const keys = [...byKey.keys()];
  if (!keys.length) return new Map();

  const { data: existing, error } = await db.from('sourcing_merchants').select('id, name_key, times_seen').in('name_key', keys);
  if (error) throw error;
  const now = new Date().toISOString();
  const existingMap = new Map((existing ?? []).map((m) => [m.name_key, m]));
  const rows = keys.map((key) => {
    const v = byKey.get(key);
    const ex = existingMap.get(key);
    return { name_key: key, name: v.name, times_seen: (ex?.times_seen ?? 0) + v.count, last_price: v.price, last_seen_at: now };
  });
  const { data: saved, error: upErr } = await db
    .from('sourcing_merchants')
    .upsert(rows, { onConflict: 'name_key' })
    .select('id, name, name_key, trust, website');
  if (upErr) throw upErr;

  const fresh = (saved ?? []).filter((m) => !existingMap.has(m.name_key));
  await Promise.all([
    ...(saved ?? [])
      .filter((m) => !m.website)
      .map((m) => ({ id: m.id, site: guessWebsite(m.name) }))
      .filter((m) => m.site)
      .map((m) => db.from('sourcing_merchants').update({ website: m.site }).eq('id', m.id).is('website', null)),
    // Tiendas grandes nuevas: autorizadas y marcadas como marketplace (si la columna ya existe)
    ...fresh
      .filter((m) => AUTHORIZED_KEYS.has(m.name_key))
      .map((m) => db.from('sourcing_merchants').update({ authorized: true, is_marketplace: MARKETPLACE_KEYS.has(m.name_key) }).eq('id', m.id)),
  ]);
  return new Map((saved ?? []).map((m) => [m.name_key, { id: m.id, trust: m.trust }]));
}

export async function merchantsForOffers(db, offers) {
  const ids = [...new Set(offers.map((o) => o.merchant_id).filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await db.from('sourcing_merchants').select('*').in('id', ids);
  return Object.fromEntries((data ?? []).map((m) => [m.id, m]));
}

/** Guarda la búsqueda y sus ofertas. Devuelve { search, offers }. */
export async function saveSearch(db, { query, start = 0, productId = null, normalized, durationMs }) {
  const merchantMap = await upsertMerchants(db, normalized.map((o) => ({ shop: o.shop, price: o.unit_price_mxn })));
  const { data: search, error: sErr } = await db
    .from('sourcing_searches')
    .insert({ query, query_key: normalizeKey(query), page: start, product_id: productId, results: normalized.length, duration_ms: durationMs, status: 'ok' })
    .select('id, created_at')
    .single();
  if (sErr) throw sErr;

  let offers = [];
  if (normalized.length) {
    const rows = normalized.map((o) => ({ ...o, search_id: search.id, merchant_id: merchantMap.get(normalizeKey(o.shop))?.id ?? null }));
    let { data: inserted, error: oErr } = await db.from('sourcing_offers').insert(rows).select('*');
    if (oErr && (oErr.code === 'PGRST204' || /is_installment|seller/.test(oErr.message || ''))) {
      ({ data: inserted, error: oErr } = await db
        .from('sourcing_offers')
        .insert(rows.map(({ is_installment: _i, seller: _s, ...r }) => r))
        .select('*'));
    }
    if (oErr) throw oErr;
    offers = (inserted ?? []).sort((a, b) => a.position - b.position);
  }
  return { search, offers };
}

export async function logSearchError(db, { query, start = 0, productId = null, durationMs, message }) {
  await db.from('sourcing_searches').insert({
    query, query_key: normalizeKey(query), page: start, product_id: productId,
    results: 0, duration_ms: durationMs, status: 'error', error: String(message).slice(0, 300),
  });
}

/**
 * Búsqueda completa: usa la guardada si tiene menos de `cacheMinutes`, si no consulta a Google.
 * Devuelve { offers, merchants, cached, searchId }.
 */
export async function searchOffers(db, query, { productId = null, cacheMinutes = 0 } = {}) {
  const queryKey = normalizeKey(query);
  if (cacheMinutes > 0) {
    const since = new Date(Date.now() - cacheMinutes * 60_000).toISOString();
    const { data: cached } = await db
      .from('sourcing_searches')
      .select('id, created_at')
      .eq('query_key', queryKey).eq('page', 0).eq('status', 'ok').gt('results', 0)
      .gte('created_at', since)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cached) {
      const { data: offers } = await db.from('sourcing_offers').select('*').eq('search_id', cached.id).order('position');
      const list = offers ?? [];
      return { offers: list, merchants: await merchantsForOffers(db, list), cached: true, searchId: cached.id };
    }
  }
  const t0 = Date.now();
  let items;
  try {
    ({ items } = await fetchShopping(query, 0));
  } catch (e) {
    await logSearchError(db, { query, productId, durationMs: Date.now() - t0, message: e?.message || e });
    throw e;
  }
  const normalized = normalizeItems(items, 0);
  const { search, offers } = await saveSearch(db, { query, productId, normalized, durationMs: Date.now() - t0 });
  return { offers, merchants: await merchantsForOffers(db, offers), cached: false, searchId: search.id };
}

// ─── Configuración ────────────────────────────────────────────
const CONFIG_KEYS = [
  'sourcing_clip_fee_pct', 'sourcing_clip_fee_fixed', 'sourcing_iva_on_fee', 'sourcing_supplier_shipping', 'sourcing_customer_shipping',
  'auto_min_margin_pct', 'auto_min_margin_mxn', 'auto_undercut_pct', 'auto_max_change_pct', 'auto_max_delivery_days',
  'auto_check_hours', 'auto_enabled', 'auto_opportunities_per_day', 'auto_opportunity_seeds',
];

export async function loadSettings(db) {
  const { data } = await db.from('store_config').select('key, value').in('key', CONFIG_KEYS);
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const num = (k, d) => {
    const n = Number(map[k]);
    return map[k] !== undefined && map[k] !== '' && Number.isFinite(n) ? n : d;
  };
  return {
    margin: {
      clipFeePct: num('sourcing_clip_fee_pct', DEFAULT_MARGIN.clipFeePct),
      clipFeeFixed: num('sourcing_clip_fee_fixed', DEFAULT_MARGIN.clipFeeFixed),
      ivaOnFee: (map.sourcing_iva_on_fee ?? 'true') !== 'false',
      supplierShipping: num('sourcing_supplier_shipping', DEFAULT_MARGIN.supplierShipping),
      customerShipping: num('sourcing_customer_shipping', DEFAULT_MARGIN.customerShipping),
    },
    rules: {
      minMarginPct: num('auto_min_margin_pct', DEFAULT_RULES.minMarginPct),
      minMarginMxn: num('auto_min_margin_mxn', DEFAULT_RULES.minMarginMxn),
      undercutPct: num('auto_undercut_pct', DEFAULT_RULES.undercutPct),
      maxChangePct: num('auto_max_change_pct', DEFAULT_RULES.maxChangePct),
      maxDeliveryDays: num('auto_max_delivery_days', DEFAULT_RULES.maxDeliveryDays),
      checkHours: num('auto_check_hours', DEFAULT_RULES.checkHours),
    },
    enabled: (map.auto_enabled ?? 'true') !== 'false',
    opportunitiesPerDay: Math.max(0, Math.min(30, num('auto_opportunities_per_day', 6))),
    seeds: String(map.auto_opportunity_seeds ?? '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
  };
}

/** Búsqueda con la que se revisa un producto: la guardada o "marca + nombre". */
export function productQuery(p) {
  if (p.search_query && p.search_query.trim()) return p.search_query.trim();
  const name = String(p.name ?? '').trim();
  const brand = String(p.brand ?? '').trim();
  return brand && !normalizeKey(name).includes(normalizeKey(brand)) ? `${brand} ${name}` : name;
}

// ─── Revisión de un producto ──────────────────────────────────
/**
 * Busca el producto, elige el mejor proveedor elegible, calcula el precio y lo aplica.
 * - Sin proveedor elegible: se oculta (in_stock = false, auto_hidden = true).
 * - Con proveedor: precio = máx(piso de ganancia, mercado − undercut), con tope de cambio.
 * Guarda todo en product_price_checks / product_price_changes.
 */
export async function checkProduct(db, product, cfg, { cacheMinutes = 30 } = {}) {
  const query = productQuery(product);
  const now = new Date().toISOString();
  const current = Number(product.price) || 0;
  let result;
  try {
    result = await searchOffers(db, query, { productId: product.id, cacheMinutes });
  } catch (e) {
    await db.from('products').update({ sourcing_status: 'error', sourcing_note: String(e?.message || e).slice(0, 200), sourcing_checked_at: now }).eq('id', product.id);
    await db.from('product_price_checks').insert({ product_id: product.id, status: 'error', price_before: current, price_after: current, note: String(e?.message || e).slice(0, 300) });
    return { productId: product.id, status: 'error', note: String(e?.message || e) };
  }

  const spec = buildSpec(query, product.brand ?? null);
  const ev = evaluateAll(result.offers, spec, current || null, cfg.margin, result.merchants, cfg.rules.maxDeliveryDays);
  const reviewsTotal = ev.offers.filter((o) => o.match === 'exacta' && o.reviews).reduce((mx, o) => Math.max(mx, o.reviews), 0) || null;

  if (!result.offers.length) {
    await db.from('products').update({ sourcing_status: 'sin_datos', sourcing_note: 'Google no devolvió ofertas', sourcing_checked_at: now }).eq('id', product.id);
    await db.from('product_price_checks').insert({ product_id: product.id, status: 'sin_datos', price_before: current, price_after: current, note: 'Google no devolvió ofertas' });
    return { productId: product.id, status: 'sin_datos' };
  }

  if (!ev.best) {
    // Si lo único que falta es capturar los días de entrega de una tienda autorizada, no se oculta:
    // se avisa qué tienda capturar (evita ocultar todo el catálogo el primer día).
    const missingDays = [...new Set(ev.offers
      .filter((o) => o.match === 'exacta' && !o.installment && !o.own && o.eligibility === 'Falta capturar días de entrega')
      .map((o) => o.shop))];
    if (missingDays.length) {
      const note = `Captura los días de entrega de: ${missingDays.slice(0, 4).join(', ')} (Abastecimiento → Tiendas)`;
      await db.from('products').update({ sourcing_status: 'sin_datos', sourcing_note: note.slice(0, 300), sourcing_checked_at: now }).eq('id', product.id);
      await db.from('product_price_checks').insert({
        product_id: product.id, status: 'sin_datos', offers_total: result.offers.length, offers_exact: ev.exactCount,
        market_low: ev.marketLow, market_ref: ev.marketRef, price_before: current, price_after: current, reviews_total: reviewsTotal, note: note.slice(0, 300),
      });
      return { productId: product.id, status: 'sin_datos', note };
    }
    const exactNotEligible = ev.offers.filter((o) => o.match === 'exacta' && !o.eligible).map((o) => `${o.shop}: ${o.eligibility}`);
    const note = ev.exactCount
      ? `Hay ${ev.exactCount} oferta(s) exacta(s) pero ningún proveedor válido${exactNotEligible.length ? ` (${[...new Set(exactNotEligible)].slice(0, 3).join('; ')})` : ''}`
      : 'Ninguna oferta coincide exacto con el producto';
    const patch = { sourcing_status: 'sin_proveedor', sourcing_note: note.slice(0, 300), sourcing_checked_at: now };
    if (product.in_stock) Object.assign(patch, { in_stock: false, auto_hidden: true });
    await db.from('products').update(patch).eq('id', product.id);
    await db.from('product_sources').update({ available: false, last_checked_at: now }).eq('product_id', product.id).eq('is_primary', true);
    await db.from('product_price_checks').insert({
      product_id: product.id, status: 'sin_proveedor', offers_total: result.offers.length, offers_exact: ev.exactCount,
      market_low: ev.marketLow, price_before: current, price_after: current, reviews_total: reviewsTotal, note: note.slice(0, 300),
    });
    return { productId: product.id, status: 'sin_proveedor', note };
  }

  const best = ev.best;
  const floor = floorPrice(best.unit_price_mxn, best.shipping, cfg.margin, cfg.rules);
  const { target, notes } = targetPrice({ floor, market: ev.marketRef, current, rules: cfg.rules });
  const apply = product.auto_price !== false && current > 0 && Math.abs(target - current) >= 1;
  const finalPrice = apply ? target : current;
  const m = computeMargin(finalPrice, best.unit_price_mxn, cfg.margin, best.shipping);

  const productPatch = {
    sourcing_status: 'ok',
    sourcing_note: notes.join(' · ') || null,
    sourcing_checked_at: now,
    cost_price: best.costTotal,
  };
  if (apply) productPatch.price = finalPrice;
  if (product.auto_hidden && !product.in_stock) Object.assign(productPatch, { in_stock: true, auto_hidden: false });
  const { error: upErr } = await db.from('products').update(productPatch).eq('id', product.id);
  if (upErr) throw upErr;

  if (apply) {
    const reason = finalPrice > current
      ? (floor > current ? 'Subió el costo del proveedor' : 'El mercado subió')
      : 'Mejor oferta en el mercado: se ajustó para competir';
    await db.from('product_price_changes').insert({
      product_id: product.id, old_price: current, new_price: finalPrice, unit_cost: best.costTotal, market_low: ev.marketRef ?? ev.marketLow,
      reason: notes.length ? `${reason} · ${notes.join(' · ')}` : reason, source: 'auto',
    });
  }

  // Proveedor principal = el mejor elegible de esta revisión
  const sourceRow = {
    merchant_id: best.merchant_id, offer_id: best.id, shop: best.shop, offer_title: best.title, link: best.link,
    unit_cost_mxn: best.unit_price_mxn, shipping_mxn: best.shipping, sale_price_mxn: finalPrice,
    margin_mxn: m.margin ?? 0, match_level: best.match, last_checked_at: now, available: true,
  };
  const { data: primary } = await db.from('product_sources').select('id').eq('product_id', product.id).eq('is_primary', true).limit(1).maybeSingle();
  if (primary) await db.from('product_sources').update(sourceRow).eq('id', primary.id);
  else await db.from('product_sources').insert({ ...sourceRow, product_id: product.id, is_primary: true });

  await db.from('product_price_checks').insert({
    product_id: product.id, status: 'ok', offers_total: result.offers.length, offers_exact: ev.exactCount,
    best_shop: best.shop, best_offer_title: best.title, best_link: best.link, best_unit_cost: best.unit_price_mxn,
    best_shipping: best.shipping, market_low: ev.marketLow, market_ref: ev.marketRef, floor_price: floor, target_price: target,
    price_before: current, price_after: finalPrice, margin_mxn: m.margin, margin_pct: m.marginPct,
    reviews_total: reviewsTotal, note: notes.join(' · ') || null,
  });
  return { productId: product.id, status: 'ok', price: finalPrice, changed: apply, shop: best.shop, margin: m.margin };
}

/** Productos bajo pedido con proveedor principal (los que se revisan solos). */
export async function dueProducts(db, cfg, limit) {
  const { data: src } = await db.from('product_sources').select('product_id').eq('is_primary', true);
  const ids = [...new Set((src ?? []).map((r) => r.product_id))];
  if (!ids.length) return [];
  const before = new Date(Date.now() - cfg.rules.checkHours * 3600_000).toISOString();
  const { data, error } = await db
    .from('products')
    .select('*')
    .in('id', ids)
    .eq('fulfillment', 'bajo_pedido')
    .or(`in_stock.eq.true,auto_hidden.eq.true`)
    .or(`sourcing_checked_at.is.null,sourcing_checked_at.lt.${before}`)
    .order('sourcing_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ─── Verificación de un pedido antes de comprar ──────────────
/**
 * Consulta en vivo cada producto bajo pedido de un pedido pagado y decide:
 * comprar (mismo proveedor), cambiar_proveedor (otro elegible) o suspender (sin proveedor o pérdida).
 */
export async function verifyOrder(db, order, cfg) {
  const items = Array.isArray(order.items) ? order.items : [];
  const ids = [...new Set(items.map((it) => it?.product?.id).filter(Boolean))];
  const { data: prods } = ids.length ? await db.from('products').select('*').in('id', ids) : { data: [] };
  const { data: sources } = ids.length
    ? await db.from('product_sources').select('*').in('product_id', ids).eq('is_primary', true)
    : { data: [] };
  const byId = Object.fromEntries((prods ?? []).map((p) => [p.id, p]));
  const srcBy = Object.fromEntries((sources ?? []).map((s) => [s.product_id, s]));

  const detail = await Promise.all(items.map(async (it) => {
    const p = byId[it?.product?.id];
    const qty = Math.max(1, Number(it?.quantity) || 1);
    const paid = Number(it?.product?.price) || Number(p?.price) || 0;
    if (!p) return { name: it?.product?.name ?? 'Producto', qty, status: 'suspender', note: 'El producto ya no existe' };
    if (p.fulfillment !== 'bajo_pedido') return { name: p.name, qty, status: 'stock', note: 'Producto de stock propio' };
    try {
      const query = productQuery(p);
      const r = await searchOffers(db, query, { productId: p.id, cacheMinutes: 0 });
      const ev = evaluateAll(r.offers, buildSpec(query, p.brand ?? null), paid, cfg.margin, r.merchants, cfg.rules.maxDeliveryDays);
      if (!ev.best) return { name: p.name, qty, paid, status: 'suspender', note: 'Sin proveedor válido con existencia ahora' };
      const best = ev.best;
      const mm = computeMargin(paid, best.unit_price_mxn, cfg.margin, best.shipping);
      const prev = srcBy[p.id];
      const sameShop = prev && normalizeKey(prev.shop) === normalizeKey(best.shop);
      const minOk = mm.margin !== null && mm.margin >= Math.min(cfg.rules.minMarginMxn, paid * cfg.rules.minMarginPct / 100);
      return {
        name: p.name, qty, paid,
        status: mm.margin === null || mm.margin < 0 ? 'suspender' : sameShop ? 'comprar' : 'cambiar_proveedor',
        shop: best.shop, seller: best.seller ?? null, link: best.link, title: best.title,
        unit_cost: best.unit_price_mxn, shipping: best.shipping, margin: mm.margin, margin_pct: mm.marginPct,
        previous_shop: prev?.shop ?? null, previous_cost: prev?.unit_cost_mxn ?? null,
        note: mm.margin !== null && mm.margin < 0 ? 'Comprar ahora deja pérdida' : !minOk ? 'Margen debajo de tu mínimo' : best.eligibility,
      };
    } catch (e) {
      return { name: p.name, qty, paid, status: 'suspender', note: `No se pudo consultar: ${String(e?.message || e).slice(0, 120)}` };
    }
  }));

  const relevant = detail.filter((d) => d.status !== 'stock');
  const decision = relevant.some((d) => d.status === 'suspender') ? 'suspender'
    : relevant.some((d) => d.status === 'cambiar_proveedor') ? 'cambiar_proveedor' : 'comprar';
  const margin = round2(relevant.reduce((s, d) => s + (d.margin ?? 0) * (d.qty ?? 1), 0));
  return { decision, margin, detail };
}

// ─── Demanda y oportunidades ─────────────────────────────────
/** Autocompletado público de Google (gratis). Devuelve las sugerencias en orden. */
export async function googleSuggest(q) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=es&gl=mx&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'Accept-Language': 'es-MX' } });
    if (!r.ok) return [];
    const text = await r.text();
    const data = JSON.parse(text);
    return Array.isArray(data?.[1]) ? data[1].map(String).slice(0, 10) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Evalúa una oportunidad: demanda (autocompletado, reseñas y reseñas nuevas), competencia,
 * proveedor válido, precio de mercado y ganancia. Candidato ≠ verificado.
 */
export async function evaluateOpportunity(db, opp, cfg) {
  const query = opp.query;
  const [r, suggestions] = await Promise.all([
    searchOffers(db, query, { cacheMinutes: 360 }),
    googleSuggest(query.split(' ').slice(0, 3).join(' ')),
  ]);
  const spec = buildSpec(query, null);
  const ev = evaluateAll(r.offers, spec, null, cfg.margin, r.merchants, cfg.rules.maxDeliveryDays);
  const related = ev.offers.filter((o) => o.match !== 'no_confirmada' && !o.own);
  const exact = ev.offers.filter((o) => o.match === 'exacta' && !o.own && !o.installment);
  const shops = new Set(related.map((o) => normalizeKey(o.shop)));
  const authShops = new Set(related.filter((o) => o.eligible).map((o) => normalizeKey(o.shop)));
  const reviewsTotal = exact.reduce((mx, o) => Math.max(mx, o.reviews ?? 0), 0);
  const ratings = exact.map((o) => o.rating).filter((x) => typeof x === 'number');
  const rating = ratings.length ? round2(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
  const reviewsDelta = opp.reviews_total != null && reviewsTotal ? Math.max(0, reviewsTotal - opp.reviews_total) : null;
  const qk = normalizeKey(query);
  const rankIdx = suggestions.findIndex((s) => normalizeKey(s) === qk || normalizeKey(s).startsWith(qk));
  const suggestRank = rankIdx >= 0 ? rankIdx + 1 : (opp.suggest_rank ?? null);

  // Puntaje 0–100. Las reseñas nuevas (velocidad) pesan más que aparecer mucho.
  let score = 0;
  const reasons = [];
  if (suggestRank) { score += Math.max(0, 11 - suggestRank) * 2.5; reasons.push(`Google lo sugiere (#${suggestRank})`); }
  if (reviewsTotal) { score += Math.min(25, Math.log10(reviewsTotal + 1) * 9); reasons.push(`${reviewsTotal} reseñas`); }
  if (reviewsDelta) { score += Math.min(30, reviewsDelta * 2); reasons.push(`+${reviewsDelta} reseñas nuevas desde la revisión anterior`); }
  else if (opp.reviews_total == null) reasons.push('Falta una segunda revisión para medir ventas recientes');
  if (rating !== null && rating >= 4.3) { score += 8; reasons.push(`★ ${rating}`); }
  if (shops.size >= 2 && shops.size <= 8) { score += 10; reasons.push(`${shops.size} tiendas lo venden`); }
  else if (shops.size > 15) { score += 2; reasons.push(`Mucha competencia (${shops.size} tiendas)`); }
  else if (shops.size) { score += 5; reasons.push(`${shops.size} tienda(s) lo venden`); }
  score = Math.min(100, round2(score));

  let suggested = null; let margin = null; let marginPct = null;
  if (ev.best) {
    const floor = floorPrice(ev.best.unit_price_mxn, ev.best.shipping, cfg.margin, cfg.rules);
    suggested = targetPrice({ floor, market: ev.marketRef, current: ev.marketRef ?? floor, rules: { ...cfg.rules, maxChangePct: 0 } }).target;
    const m = computeMargin(suggested, ev.best.unit_price_mxn, cfg.margin, ev.best.shipping);
    margin = m.margin; marginPct = m.marginPct;
  }

  const competitive = suggested !== null && ev.marketRef !== null && suggested <= ev.marketRef * 1.05;
  const verified = Boolean(ev.best) && competitive && reviewsTotal >= 20 && score >= 35;
  if (!ev.best) reasons.push(exact.length ? 'Ningún proveedor autorizado con entrega al día siguiente' : 'Sin oferta exacta');
  else if (!competitive) reasons.push('Con tu ganancia mínima quedarías más caro que el mercado');

  const patch = {
    brand: spec.brand, demand_score: score, suggest_rank: suggestRank, reviews_total: reviewsTotal || null,
    reviews_delta: reviewsDelta, rating, sellers: shops.size, authorized_sellers: authShops.size,
    best_shop: ev.best?.shop ?? null, best_unit_cost: ev.best?.unit_price_mxn ?? null, market_low: ev.marketLow, market_ref: ev.marketRef,
    suggested_price: suggested, margin_mxn: margin, margin_pct: marginPct, reasons, checked_at: new Date().toISOString(),
  };
  if (opp.status === 'candidato' || opp.status === 'verificado') patch.status = verified ? 'verificado' : 'candidato';
  await db.from('sourcing_opportunities').update(patch).eq('id', opp.id);
  return { id: opp.id, ...patch };
}

/** Nuevas ideas a partir de tus búsquedas semilla (autocompletado de Google). */
export async function discoverFromSeeds(db, seeds) {
  let added = 0;
  for (const seed of seeds) {
    const list = await googleSuggest(seed);
    const rows = list
      .map((q, i) => ({ query: q, query_key: normalizeKey(q), origin: 'sugerencia', seed, suggest_rank: i + 1 }))
      .filter((r) => r.query_key.length >= 4);
    if (!rows.length) continue;
    const { data } = await db.from('sourcing_opportunities').upsert(rows, { onConflict: 'query_key', ignoreDuplicates: true }).select('id');
    added += data?.length ?? 0;
  }
  return added;
}
