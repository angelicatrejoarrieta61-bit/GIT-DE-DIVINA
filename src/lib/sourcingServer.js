/**
 * sourcingServer.js — Código de servidor compartido por api/sourcing-search.ts y api/sourcing-auto.ts.
 * Google Shopping MX vía Bright Data (zona SERP), directorio de tiendas, histórico de ofertas,
 * revisión automática de productos, regla de precio y verificación de pedidos.
 * JS puro (ESM) para que las funciones de Vercel lo importen sin compilar. Solo corre en el servidor.
 */
import {
  normalizeKey, parsePrice, parseMxn, parsePackQty, splitSeller, buildSpec, evaluateAll, compactQuery,
  floorPrice, targetPrice, computeMargin, round2, DEFAULT_MARGIN, DEFAULT_RULES, effectivePrice,
  bandPrice, findTrackedOffer, shopKey,
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
      const alt = altPriceText(it, price);
      const eff = effectivePrice({ price_mxn: price, old_price_mxn: parseMxn(it.old_price) ?? parsed.high ?? null, alt_price_text: alt });
      const now = eff.price ?? price;
      return {
        shop: it.shop.trim(),
        title: it.title.trim(),
        link: it.link && /^https:\/\//.test(it.link) ? it.link : null,
        price_mxn: now,
        old_price_mxn: eff.original ?? parseMxn(it.old_price) ?? parsed.high ?? null,
        alt_price_text: alt,
        is_installment: parsed.installment,
        seller,
        pack_qty: pack,
        unit_price_mxn: now !== null ? round2(now / pack) : null,
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
  'auto_min_margin_pct', 'auto_max_margin_pct', 'auto_min_margin_mxn', 'auto_undercut_pct', 'auto_max_change_pct', 'auto_max_delivery_days',
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
      maxMarginPct: num('auto_max_margin_pct', DEFAULT_RULES.maxMarginPct),
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
const SOURCE_COLS = 'id, product_id, merchant_id, offer_id, shop, offer_title, link, unit_cost_mxn, shipping_mxn, is_primary';

/** Búsquedas con las que se revisa: la que hiciste al agregarlo, el título de la oferta elegida y marca + nombre. */
export function checkQueries(product, source) {
  const list = [product.search_query, source?.offer_title ? compactQuery(source.offer_title) : null, productQuery(product)]
    .map((q) => (q ?? '').trim())
    .filter((q) => q.length >= 3);
  const seen = new Set();
  return list.filter((q) => (seen.has(normalizeKey(q)) ? false : (seen.add(normalizeKey(q)), true))).slice(0, 2);
}

/** Otra tienda con el mismo producto exacto: autorizada o marcada confiable, la más barata. */
function substituteOf(offers, merchants) {
  return offers
    .filter((o) => o.match === 'exacta' && o.unit_price_mxn !== null && !o.installment && !o.own)
    .filter((o) => {
      const m = o.merchant_id ? merchants[o.merchant_id] : null;
      return m && m.trust !== 'descartado' && (m.authorized || m.trust === 'confiable');
    })
    .sort((x, y) => (x.unit_price_mxn + x.shipping) - (y.unit_price_mxn + y.shipping))[0] ?? null;
}

/**
 * Revisa un producto vigilado:
 *  1) vuelve a hacer la búsqueda con la que lo agregaste y localiza LA MISMA oferta (misma tienda y producto);
 *  2) si ya no aparece, toma la tienda autorizada más barata con el mismo producto exacto (cambia de proveedor);
 *  3) si no hay ninguna, lo retira de la venta (in_stock = false, auto_hidden = true) hasta que vuelva a aparecer.
 * Precio: sigue al costo con ganancia entre la mínima y la máxima (bandPrice). Con "Automatizar" apagado
 * solo registra el costo: no cambia precio ni lo oculta.
 */
export async function checkProduct(db, product, cfg, { cacheMinutes = 30 } = {}) {
  const now = new Date().toISOString();
  const current = Number(product.price) || 0;
  const auto = product.auto_price !== false;
  const { data: source } = await db.from('product_sources').select(SOURCE_COLS)
    .eq('product_id', product.id).eq('is_primary', true).order('created_at', { ascending: false }).limit(1).maybeSingle();

  const queries = checkQueries(product, source);
  // Producto contra el que se buscan sustitutos: la búsqueda con la que lo encontraste (p. ej. "… Espumoso 473")
  const spec = buildSpec(product.search_query || queries[0] || source?.offer_title || product.name, product.brand ?? null);
  let tracked = null;
  let lastError = null;
  let total = 0;
  const pool = [];
  const merchants = {};
  for (const q of queries) {
    let r;
    try {
      r = await searchOffers(db, q, { productId: product.id, cacheMinutes });
    } catch (e) {
      lastError = String(e?.message || e);
      continue;
    }
    Object.assign(merchants, r.merchants);
    const ev = evaluateAll(r.offers, spec, current || null, cfg.margin, r.merchants, cfg.rules.maxDeliveryDays);
    total += ev.offers.length;
    pool.push(...ev.offers);
    tracked = findTrackedOffer(ev.offers, source, product.search_query || null);
    if (tracked) break;
  }

  const logCheck = (row) => db.from('product_price_checks').insert({ product_id: product.id, price_before: current, ...row });

  // Google no respondió: no se toca nada, se reintenta en la próxima vuelta
  if (!total) {
    const note = lastError ? `No se pudo consultar: ${lastError}` : 'Google no devolvió ofertas';
    const status = lastError ? 'error' : 'sin_datos';
    await db.from('products').update({ sourcing_status: status, sourcing_note: note.slice(0, 300), sourcing_checked_at: now }).eq('id', product.id);
    await logCheck({ status, price_after: current, note: note.slice(0, 300) });
    return { productId: product.id, status, note };
  }

  const pick = tracked ?? substituteOf(pool, merchants);
  const exactCount = pool.filter((o) => o.match === 'exacta').length;

  // Sin la oferta ni sustituto: se retira de la venta
  if (!pick) {
    const note = source
      ? `Ya no aparece la oferta de ${source.shop} ni otra tienda autorizada con el mismo producto`
      : 'Ninguna tienda autorizada tiene el mismo producto';
    const patch = { sourcing_status: 'sin_proveedor', sourcing_note: auto ? `${note} · retirado de la venta` : note, sourcing_checked_at: now };
    if (auto && product.in_stock) Object.assign(patch, { in_stock: false, auto_hidden: true });
    await db.from('products').update(patch).eq('id', product.id);
    if (source) await db.from('product_sources').update({ available: false, last_checked_at: now }).eq('id', source.id);
    await logCheck({ status: 'sin_proveedor', offers_total: total, offers_exact: exactCount, price_after: current, note: note.slice(0, 300) });
    return { productId: product.id, status: 'sin_proveedor', note };
  }

  const cost = round2(pick.unit_price_mxn + pick.shipping);
  const prevCost = source ? round2(Number(source.unit_cost_mxn || 0) + Number(source.shipping_mxn || 0)) : null;
  const band = bandPrice({ cost, prevCost, current, settings: cfg.margin, rules: cfg.rules });
  const apply = auto && Math.abs(band.target - current) >= 1;
  const finalPrice = apply ? band.target : current;
  const m = computeMargin(finalPrice, pick.unit_price_mxn, cfg.margin, pick.shipping);
  const switched = !tracked && (!source || shopKey(source.shop) !== shopKey(pick.shop));
  const offerTxt = `${pick.shop} a ${pick.unit_price_mxn}${pick.discountPct ? ` (−${pick.discountPct}%)` : ''}`;
  const notes = [
    switched ? `Cambió de proveedor: ${source?.shop ?? 'sin proveedor'} → ${offerTxt}` : offerTxt,
    band.note,
    !auto ? 'Automatizar apagado: precio sin cambio' : null,
  ].filter(Boolean);

  const productPatch = {
    ...(!product.search_query && queries[0] ? { search_query: queries[0] } : {}),
    sourcing_status: 'ok',
    sourcing_note: notes.join(' · ').slice(0, 300),
    sourcing_checked_at: now,
    cost_price: cost,
  };
  if (apply) productPatch.price = finalPrice;
  if (auto && product.auto_hidden && !product.in_stock) Object.assign(productPatch, { in_stock: true, auto_hidden: false });
  const { error: upErr } = await db.from('products').update(productPatch).eq('id', product.id);
  if (upErr) throw upErr;

  if (apply) {
    await db.from('product_price_changes').insert({
      product_id: product.id, old_price: current, new_price: finalPrice, unit_cost: cost, market_low: null,
      reason: notes.join(' · ').slice(0, 300), source: 'auto',
    });
  }

  const sourceRow = {
    merchant_id: pick.merchant_id, offer_id: pick.id ?? null, shop: pick.shop, offer_title: pick.title, link: pick.link,
    unit_cost_mxn: pick.unit_price_mxn, shipping_mxn: pick.shipping, sale_price_mxn: finalPrice,
    margin_mxn: m.margin ?? 0, match_level: tracked ? 'exacta' : pick.match, last_checked_at: now, available: true,
  };
  if (source) await db.from('product_sources').update(sourceRow).eq('id', source.id);
  else await db.from('product_sources').insert({ ...sourceRow, product_id: product.id, is_primary: true });

  await logCheck({
    status: 'ok', offers_total: total, offers_exact: exactCount,
    best_shop: pick.shop, best_offer_title: pick.title, best_link: pick.link, best_unit_cost: pick.unit_price_mxn,
    best_shipping: pick.shipping, floor_price: band.lo, target_price: band.target,
    price_after: finalPrice, margin_mxn: m.margin, margin_pct: m.marginPct, note: notes.join(' · ').slice(0, 300),
  });
  return { productId: product.id, status: 'ok', price: finalPrice, changed: apply, shop: pick.shop, cost, switched, margin: m.margin, marginPct: m.marginPct };
}

/** Productos vigilados con Automatizar encendido cuya última revisión ya venció. */
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
    .eq('auto_price', true)
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
