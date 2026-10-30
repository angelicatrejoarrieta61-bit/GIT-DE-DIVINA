import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  loadSettings, dueProducts, checkProduct, verifyOrder, evaluateOpportunity, discoverFromSeeds,
} from '../src/lib/sourcingServer.js';

/**
 * /api/sourcing-auto — Abastecimiento automático.
 *
 * Trabajos (?job=…):
 *  - tick           Revisa los productos bajo pedido cuya última revisión tiene más de N horas (pocos por llamada)
 *                   y, de paso, si llegaron los correos de confirmación de pedidos (send-email → order-mail-check).
 *                   Lo llama Supabase (pg_cron) cada 10 min con el header x-cron-token.
 *  - opportunities  Ideas nuevas desde tus búsquedas semilla + evaluación de oportunidades. pg_cron, 1 vez al día.
 *  - check          Revisar un producto ahora (admin).            Body: { productId }
 *  - verify-order   Verificar proveedor de un pedido pagado (admin). Body: { orderId }
 *  - evaluate       Evaluar una oportunidad ahora (admin).        Body: { opportunityId }
 *
 * Auth: x-cron-token (validado en la base con sourcing_cron_token_ok) o sesión de admin (Bearer).
 * Env (Vercel): BRIGHTDATA_API_KEY, BRIGHTDATA_SERP_ZONE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const TIME_BUDGET_MS = 38_000;     // no empezar otra revisión después de esto (límite de la función: 60 s)
const PRODUCTS_PER_TICK = 3;

function adminClient(): SupabaseClient {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Llama a /api/send-email (order-mail-check) con el mismo token del cron. Nunca detiene la revisión de precios. */
async function checkOrderMails(req: VercelRequest) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'www.divinastore.com.mx');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(`https://${host}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-token': String(req.headers['x-cron-token'] || '') },
      body: JSON.stringify({ type: 'order-mail-check' }),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, checked: Array.isArray(j?.results) ? j.results.length : 0, skipped: j?.skipped ?? null };
  } catch (e) {
    return { status: 0, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function whoCalls(db: SupabaseClient, req: VercelRequest): Promise<'cron' | 'admin' | null> {
  const cronToken = String(req.headers['x-cron-token'] || '');
  if (cronToken) {
    const { data, error } = await db.rpc('sourcing_cron_token_ok', { p_token: cronToken });
    if (!error && data === true) return 'cron';
  }
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) {
    const { data, error } = await db.auth.getUser(bearer);
    if (!error && data?.user) return 'admin';
  }
  return null;
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

  const caller = await whoCalls(db, req);
  if (!caller) return res.status(401).json({ ok: false, error: 'No autorizado.' });

  const job = String(req.query.job || '');
  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, error: 'Solicitud inválida.' });
  }

  const started = Date.now();
  try {
    const cfg = await loadSettings(db);

    // ── Revisión programada ───────────────────────────────────────
    if (job === 'tick') {
      // De paso (cada 10 min): ¿llegaron los correos de confirmación? Reenvía los que fallaron.
      const mail = caller === 'cron' ? await checkOrderMails(req) : null;
      if (!cfg.enabled) return res.status(200).json({ ok: true, skipped: 'Automatización apagada', mail });
      const due = await dueProducts(db, cfg, PRODUCTS_PER_TICK);
      const results = [];
      for (const p of due) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        try {
          results.push(await checkProduct(db, p, cfg));
        } catch (e) {
          console.error('[sourcing-auto] check', p.id, e);
          results.push({ productId: p.id, status: 'error', note: (e as Error).message });
        }
      }
      return res.status(200).json({ ok: true, checked: results.length, results, mail });
    }

    // ── Oportunidades (diario) ────────────────────────────────────
    if (job === 'opportunities') {
      if (caller === 'cron' && !cfg.enabled) return res.status(200).json({ ok: true, skipped: 'Automatización apagada' });
      const added = cfg.seeds.length ? await discoverFromSeeds(db, cfg.seeds) : 0;
      const staleBefore = new Date(Date.now() - 20 * 3600_000).toISOString();
      const { data: due } = await db
        .from('sourcing_opportunities')
        .select('*')
        .in('status', ['candidato', 'verificado'])
        .or(`checked_at.is.null,checked_at.lt.${staleBefore}`)
        .order('checked_at', { ascending: true, nullsFirst: true })
        .limit(cfg.opportunitiesPerDay);
      const evaluated = [];
      for (const o of due ?? []) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        try { evaluated.push(await evaluateOpportunity(db, o, cfg)); }
        catch (e) { console.error('[sourcing-auto] opportunity', o.id, e); }
      }
      return res.status(200).json({ ok: true, added, evaluated: evaluated.length });
    }

    // ── Acciones del admin ────────────────────────────────────────
    if (caller !== 'admin') return res.status(403).json({ ok: false, error: 'Solo desde el panel.' });

    if (job === 'check') {
      const id = String(body.productId || '');
      if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Producto inválido.' });
      const { data: p, error } = await db.from('products').select('*').eq('id', id).maybeSingle();
      if (error || !p) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
      const result = await checkProduct(db, p, cfg, { cacheMinutes: 0 });
      return res.status(200).json({ ok: true, result });
    }

    if (job === 'verify-order') {
      const id = String(body.orderId || '');
      if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Pedido inválido.' });
      const { data: order, error } = await db.from('orders').select('*').eq('id', id).maybeSingle();
      if (error || !order) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
      const result = await verifyOrder(db, order, cfg);
      const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      const { data: u } = await db.auth.getUser(bearer);
      await db.from('order_supplier_checks').insert({
        order_id: id, decision: result.decision, margin_mxn: result.margin, detail: result.detail, checked_by: u?.user?.id ?? null,
      });
      return res.status(200).json({ ok: true, result });
    }

    if (job === 'evaluate') {
      const id = String(body.opportunityId || '');
      if (!UUID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Oportunidad inválida.' });
      const { data: o, error } = await db.from('sourcing_opportunities').select('*').eq('id', id).maybeSingle();
      if (error || !o) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada.' });
      const result = await evaluateOpportunity(db, o, cfg);
      return res.status(200).json({ ok: true, result });
    }

    return res.status(400).json({ ok: false, error: 'Trabajo desconocido.' });
  } catch (e) {
    console.error('[sourcing-auto]', job, e);
    return res.status(500).json({ ok: false, error: (e as Error).message || 'Error interno.' });
  }
}
