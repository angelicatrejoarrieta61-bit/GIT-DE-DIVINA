import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeKey } from '../src/lib/sourcingCore.js';
import { fetchShopping, normalizeItems, saveSearch, logSearchError, merchantsForOffers } from '../src/lib/sourcingServer.js';

/**
 * POST /api/sourcing-search
 * Busca un producto en Google Shopping México vía Bright Data (zona SERP API),
 * normaliza las ofertas (mensualidades, paquetes, vendedor), actualiza el directorio de tiendas
 * y guarda el histórico. La lógica vive en src/lib/sourcingServer.js (compartida con sourcing-auto).
 *
 * Body: { query: string; start?: number; productId?: string; refresh?: boolean }
 * Header: Authorization: Bearer <access_token de Supabase del admin>
 *
 * Env (Vercel): BRIGHTDATA_API_KEY, BRIGHTDATA_SERP_ZONE,
 *               SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

const CACHE_HOURS = 6;
/** Búsquedas guardadas antes de esta fecha no traían patrocinados ni mensualidades separadas: no se reutilizan. */
const CACHE_VALID_FROM = '2026-10-29T18:00:00Z';
const MAX_SEARCHES_PER_MINUTE = 15;

function adminClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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
  let body: { query?: unknown; start?: unknown; productId?: unknown; refresh?: unknown };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    return res.status(400).json({ ok: false, error: 'Solicitud inválida.' });
  }
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
      const since = new Date(Math.max(Date.now() - CACHE_HOURS * 3600_000, Date.parse(CACHE_VALID_FROM))).toISOString();
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
        const { data: offers } = await db.from('sourcing_offers').select('*').eq('search_id', cached.id).order('position', { ascending: true });
        const list = offers ?? [];
        return res.status(200).json({
          ok: true, cached: true, searchId: cached.id, fetchedAt: cached.created_at, nextStart: null,
          offers: list, merchants: await merchantsForOffers(db, list),
        });
      }
    }

    // ── Límite de uso ──────────────────────────────────────────────
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db.from('sourcing_searches').select('id', { count: 'exact', head: true }).gte('created_at', minuteAgo);
    if ((count ?? 0) >= MAX_SEARCHES_PER_MINUTE) {
      return res.status(429).json({ ok: false, error: 'Demasiadas búsquedas seguidas. Espera un minuto.' });
    }

    // ── Búsqueda real ──────────────────────────────────────────────
    const t0 = Date.now();
    let fetched: Awaited<ReturnType<typeof fetchShopping>>;
    try {
      fetched = await fetchShopping(query, start);
    } catch (e) {
      await logSearchError(db, { query, start, productId, durationMs: Date.now() - t0, message: (e as Error).message });
      return res.status(502).json({ ok: false, error: (e as Error).message });
    }
    const duration = Date.now() - t0;
    if (fetched.sources.sponsoredError) console.warn('[sourcing-search] productos patrocinados:', fetched.sources.sponsoredError);

    const normalized = normalizeItems(fetched.items, start);
    const { search, offers } = await saveSearch(db, { query, start, productId, normalized, durationMs: duration });

    return res.status(200).json({
      ok: true,
      cached: false,
      searchId: search.id,
      fetchedAt: search.created_at,
      durationMs: duration,
      nextStart: fetched.nextStart,
      sources: fetched.sources,
      offers,
      merchants: await merchantsForOffers(db, offers),
    });
  } catch (e) {
    console.error('[sourcing-search]', e);
    return res.status(500).json({ ok: false, error: 'Error interno al guardar la búsqueda.' });
  }
}
