import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * POST /api/sourcing-search
 * Busca un producto en Google Shopping México vía Bright Data (zona SERP API),
 * normaliza las ofertas, actualiza el directorio de tiendas y guarda el histórico.
 *
 * Body: { query: string; start?: number; productId?: string; refresh?: boolean }
 * Header: Authorization: Bearer <access_token de Supabase del admin>
 *
 * Env (Vercel): BRIGHTDATA_API_KEY, BRIGHTDATA_SERP_ZONE,
 *               SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

const CACHE_HOURS = 6;
const MAX_SEARCHES_PER_MINUTE = 15;
const BRIGHTDATA_TIMEOUT_MS = 55_000;
const MAX_THUMB_CHARS = 24_000;

type RawShopping = {
  title?: string;
  link?: string;
  price?: string;
  old_price?: string;
  price_details?: Array<{ type?: string; price?: string }>;
  shop?: string;
  rating?: number;
  reviews_cnt?: number;
  image?: string;
  rank?: number;
};

type OfferOut = {
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
};

function adminClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Sitios de tiendas conocidas en México. Solo dominios verificables; lo demás lo captura el usuario. */
const KNOWN_SITES: Record<string, string> = {
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

/** Sitio sugerido: tienda conocida, o el propio nombre cuando ya es un dominio (ej. "supiel.com.mx"). */
export function guessWebsite(shopName: string): string | null {
  const key = normalizeKey(shopName);
  if (KNOWN_SITES[key]) return KNOWN_SITES[key];
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|mx|com\.mx|net|org|store|shop)$/.test(key)) return `https://${key.startsWith('www.') ? key : `www.${key}`}`;
  return null;
}

export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMxn(raw?: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/\s/g, '').match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/);
  if (!m) return null;
  const n = Number(`${m[1].replace(/,/g, '')}.${m[2] ?? '0'}`);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Piezas en el anuncio: "2 piezas", "2pz", "2pcs", "pack de 3", "paquete de 6", "2x50 ml", "kit 2" */
export function parsePackQty(title: string): number {
  const t = normalizeKey(title);
  const patterns = [
    /\b(\d{1,2})\s*(?:piezas|pzas|pzs|pz|pcs|pc|unidades|uds)\b/,
    /\b(?:pack|paquete|kit|set|duo|trio)\s*(?:de|x)?\s*(\d{1,2})\b/,
    /\b(\d{1,2})\s*x\s*\d+(?:[.,]\d+)?\s*(?:ml|g|gr|oz)\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const q = Number(m[1]);
      if (q >= 2 && q <= 24) return q;
    }
  }
  if (/\bduo\b/.test(t)) return 2;
  return 1;
}

async function fetchShopping(query: string, start: number): Promise<{ items: RawShopping[]; nextStart: number | null }> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_SERP_ZONE || 'divina_serp';
  if (!apiKey) throw new Error('Falta BRIGHTDATA_API_KEY en Vercel.');

  const params = new URLSearchParams({ q: query, udm: '28', gl: 'mx', hl: 'es-419' });
  if (start > 0) params.set('start', String(start));
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
    const wrapper = (await r.json()) as { status_code?: number; body?: string; headers?: Record<string, string> };
    if (wrapper.status_code && wrapper.status_code >= 400) {
      const code = wrapper.headers?.['x-brd-error-code'] || wrapper.headers?.['x-brd-error'] || wrapper.status_code;
      throw new Error(`Google no respondió (${code})`);
    }
    const body = typeof wrapper.body === 'string' ? JSON.parse(wrapper.body || '{}') : (wrapper.body ?? {});
    const items: RawShopping[] = Array.isArray(body.shopping) ? body.shopping : [];
    const nextStart = typeof body.pagination?.next_page_start === 'number' ? body.pagination.next_page_start : null;
    return { items, nextStart };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('La búsqueda tardó demasiado. Intenta de nuevo.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function altPriceText(item: RawShopping, main: number | null): string | null {
  const parts = (item.price_details ?? [])
    .map((d) => (d.price ?? '').trim())
    .filter(Boolean)
    .filter((p) => {
      const n = parseMxn(p);
      return n === null || main === null || Math.abs(n - main) > 0.5;
    });
  return parts.length ? parts.join(' · ').slice(0, 120) : null;
}

async function upsertMerchants(db: SupabaseClient, items: Array<{ shop: string; price: number | null }>) {
  const byKey = new Map<string, { name: string; price: number | null; count: number }>();
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
  if (!keys.length) return new Map<string, { id: string; trust: string }>();

  const { data: existing, error } = await db
    .from('sourcing_merchants')
    .select('id, name_key, times_seen, trust')
    .in('name_key', keys);
  if (error) throw error;

  const now = new Date().toISOString();
  const existingMap = new Map((existing ?? []).map((m) => [m.name_key as string, m]));
  const rows = keys.map((key) => {
    const v = byKey.get(key)!;
    const ex = existingMap.get(key);
    return {
      name_key: key,
      name: v.name,
      times_seen: (ex?.times_seen ?? 0) + v.count,
      last_price: v.price,
      last_seen_at: now,
    };
  });

  const { data: saved, error: upErr } = await db
    .from('sourcing_merchants')
    .upsert(rows, { onConflict: 'name_key' })
    .select('id, name, name_key, trust, website');
  if (upErr) throw upErr;

  // Sitio sugerido para tiendas que aún no lo tienen
  await Promise.all((saved ?? [])
    .filter((m) => !m.website)
    .map((m) => ({ id: m.id as string, site: guessWebsite(m.name as string) }))
    .filter((m) => m.site)
    .map((m) => db.from('sourcing_merchants').update({ website: m.site }).eq('id', m.id).is('website', null)));
  return new Map((saved ?? []).map((m) => [m.name_key as string, { id: m.id as string, trust: m.trust as string }]));
}

async function merchantsForOffers(db: SupabaseClient, offers: OfferOut[]) {
  const ids = [...new Set(offers.map((o) => o.merchant_id).filter(Boolean))] as string[];
  if (!ids.length) return {};
  const { data } = await db
    .from('sourcing_merchants')
    .select('id, name, trust, website, notes, times_seen, gives_invoice, shipping_days_min, shipping_days_max, shipping_cost_mxn, free_shipping_from_mxn')
    .in('id', ids);
  return Object.fromEntries((data ?? []).map((m) => [m.id, m]));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });

  let db: SupabaseClient;
  try {
    db = adminClient();
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }

  // ── Auth: solo sesión válida del admin ───────────────────────────
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ ok: false, error: 'Sesión requerida.' });
  const { data: userData, error: authErr } = await db.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ ok: false, error: 'Sesión inválida o vencida.' });

  // ── Validación de entrada ────────────────────────────────────────
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as {
    query?: unknown; start?: unknown; productId?: unknown; refresh?: unknown;
  };
  const query = typeof body.query === 'string' ? body.query.replace(/\s+/g, ' ').trim() : '';
  if (query.length < 2 || query.length > 160) {
    return res.status(400).json({ ok: false, error: 'Escribe entre 2 y 160 caracteres.' });
  }
  const start = Number.isInteger(body.start) && (body.start as number) >= 0 && (body.start as number) <= 200 ? (body.start as number) : 0;
  const productId = typeof body.productId === 'string' && /^[0-9a-f-]{36}$/i.test(body.productId) ? body.productId : null;
  const refresh = body.refresh === true;
  const queryKey = normalizeKey(query);

  try {
    // ── Caché ──────────────────────────────────────────────────────
    if (!refresh) {
      const since = new Date(Date.now() - CACHE_HOURS * 3600_000).toISOString();
      const { data: cached } = await db
        .from('sourcing_searches')
        .select('id, created_at, results')
        .eq('query_key', queryKey)
        .eq('page', start)
        .eq('status', 'ok')
        .gt('results', 0)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached) {
        const { data: offers } = await db
          .from('sourcing_offers')
          .select('*')
          .eq('search_id', cached.id)
          .order('position', { ascending: true });
        const list = (offers ?? []) as OfferOut[];
        return res.status(200).json({
          ok: true,
          cached: true,
          searchId: cached.id,
          fetchedAt: cached.created_at,
          nextStart: null,
          offers: list,
          merchants: await merchantsForOffers(db, list),
        });
      }
    }

    // ── Límite de uso ──────────────────────────────────────────────
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db
      .from('sourcing_searches')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', minuteAgo);
    if ((count ?? 0) >= MAX_SEARCHES_PER_MINUTE) {
      return res.status(429).json({ ok: false, error: 'Demasiadas búsquedas seguidas. Espera un minuto.' });
    }

    // ── Búsqueda real ──────────────────────────────────────────────
    const t0 = Date.now();
    let items: RawShopping[] = [];
    let nextStart: number | null = null;
    try {
      ({ items, nextStart } = await fetchShopping(query, start));
    } catch (e) {
      await db.from('sourcing_searches').insert({
        query, query_key: queryKey, page: start, product_id: productId,
        results: 0, duration_ms: Date.now() - t0, status: 'error', error: (e as Error).message.slice(0, 300),
      });
      return res.status(502).json({ ok: false, error: (e as Error).message });
    }
    const duration = Date.now() - t0;

    const normalized = items
      .filter((it) => it.title && it.shop)
      .map((it, i) => {
        const price = parseMxn(it.price);
        const pack = parsePackQty(it.title!);
        const thumb = typeof it.image === 'string' && it.image.startsWith('data:image/') && it.image.length <= MAX_THUMB_CHARS
          ? it.image
          : null;
        return {
          shop: it.shop!.trim(),
          title: it.title!.trim(),
          link: it.link && /^https:\/\//.test(it.link) ? it.link : null,
          price_mxn: price,
          old_price_mxn: parseMxn(it.old_price),
          alt_price_text: altPriceText(it, price),
          pack_qty: pack,
          unit_price_mxn: price !== null ? Math.round((price / pack) * 100) / 100 : null,
          rating: typeof it.rating === 'number' ? it.rating : null,
          reviews: typeof it.reviews_cnt === 'number' ? it.reviews_cnt : null,
          thumbnail: thumb,
          position: start + i + 1,
        };
      });

    const merchantMap = await upsertMerchants(
      db,
      normalized.map((o) => ({ shop: o.shop, price: o.unit_price_mxn })),
    );

    const { data: search, error: sErr } = await db
      .from('sourcing_searches')
      .insert({ query, query_key: queryKey, page: start, product_id: productId, results: normalized.length, duration_ms: duration, status: 'ok' })
      .select('id, created_at')
      .single();
    if (sErr) throw sErr;

    let offers: OfferOut[] = [];
    if (normalized.length) {
      const { data: inserted, error: oErr } = await db
        .from('sourcing_offers')
        .insert(normalized.map((o) => ({
          ...o,
          search_id: search.id,
          merchant_id: merchantMap.get(normalizeKey(o.shop))?.id ?? null,
        })))
        .select('*');
      if (oErr) throw oErr;
      offers = ((inserted ?? []) as OfferOut[]).sort((a, b) => a.position - b.position);
    }

    return res.status(200).json({
      ok: true,
      cached: false,
      searchId: search.id,
      fetchedAt: search.created_at,
      durationMs: duration,
      nextStart,
      offers,
      merchants: await merchantsForOffers(db, offers),
    });
  } catch (e) {
    console.error('[sourcing-search]', e);
    return res.status(500).json({ ok: false, error: 'Error interno al guardar la búsqueda.' });
  }
}
