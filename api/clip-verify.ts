/**
 * /api/clip-verify — Confirma los cobros de los pedidos directo con la API de Clip.
 * POST { orderIds?: string[] }  (sin orderIds: revisa los cobros aún no confirmados, máx. 60)
 * Requiere sesión del admin (Authorization: Bearer <token de Supabase>).
 * Consulta GET https://api.payclip.com/payments/{id} y guarda estado, recibo, tarjeta y monto.
 * Aprobado con monto correcto → pagado + avisos. Rechazado/cancelado en Clip y el pedido seguía sin pagar → cancelado.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const FINAL = ['approved', 'rejected', 'cancelled', 'refunded'];
const FAIL = ['rejected', 'cancelled', 'canceled', 'refunded', 'declined', 'expired'];
const MAX = 60;

const cfg = () => ({
  url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  anonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
});

async function isAdmin(req: VercelRequest) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { url, anonKey } = cfg();
  if (!token || !url || !anonKey) return false;
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return !error && Boolean(data.user);
}

function clipFields(data: any) {
  const pm = data?.payment_method || {};
  const card = pm.card || {};
  const raw = data && typeof data === 'object' ? { ...data, payment_method: pm && typeof pm === 'object' ? { ...pm, token: undefined } : pm } : data;
  const amount = Number(data?.amount);
  return {
    clip_payment_id: data?.id ?? data?.transaction_id ?? null,
    clip_status: data?.status ? String(data.status).toLowerCase() : null,
    clip_status_code: data?.status_detail?.code ?? null,
    clip_receipt_no: data?.receipt_no != null ? String(data.receipt_no) : null,
    clip_auth_code: data?.authorization_code ?? data?.auth_code ?? pm.authorization_code ?? null,
    clip_card: [pm.id ? String(pm.id).toUpperCase() : '', card.last_digits ? `•••• ${card.last_digits}` : '', card.issuer || ''].filter(Boolean).join(' · ') || null,
    clip_amount: Number.isFinite(amount) ? amount : null,
    clip_approved_at: data?.approved_at ?? null,
    clip_verified_at: new Date().toISOString(),
    clip_raw: raw ?? null,
  };
}

/** Avisos de pedido pagado (send-email evita duplicados y solo envía si el pedido está pagado). */
async function notifyPaid(req: VercelRequest, orderId: string) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'www.divinastore.com.mx').split(',')[0].trim();
  try {
    await fetch(`https://${host}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'order-paid', orderId }),
    });
  } catch (e: any) {
    console.error('[clip-verify] notifyPaid:', e?.message);
  }
}

async function fetchClip(paymentId: string) {
  const keys = [process.env.CLIP_API_KEY, process.env.CLIP_SECRET].filter((k, i, a): k is string => Boolean(k) && a.indexOf(k) === i);
  if (!keys.length) return { ok: false, status: 500, data: { error: 'Falta CLIP_API_KEY en Vercel' } };
  let last = { ok: false, status: 0, data: {} as any };
  for (const key of keys) {
    const r = await fetch(`https://api.payclip.com/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
    });
    const data = await r.json().catch(() => ({}));
    last = { ok: r.ok, status: r.status, data };
    if (r.status !== 401 && r.status !== 403) break; // otra llave solo si la primera no tiene permiso
  }
  return last;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Inicia sesión en el admin.' });

  const { url, serviceKey } = cfg();
  if (!url || !serviceKey) return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.' });
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const ids: string[] = Array.isArray(req.body?.orderIds) ? req.body.orderIds.filter((x: unknown) => typeof x === 'string' && UUID_RE.test(x)).slice(0, MAX) : [];

  let query = db.from('orders').select('id,status,total,payment_info,clip_payment_id,clip_status');
  query = ids.length ? query.in('id', ids) : query.order('created_at', { ascending: false }).limit(400);
  const { data: rows, error } = await query;
  if (error) {
    const missing = /clip_/.test(error.message);
    return res.status(500).json({ error: missing ? 'Falta ejecutar la migración 20261009120000_orders_clip.sql en Supabase.' : error.message });
  }

  let targets = (rows || []).map(o => ({ ...o, pid: o.clip_payment_id || o.payment_info?.transaction_id || null }));
  if (!ids.length) targets = targets.filter(o => o.pid && !FINAL.includes(String(o.clip_status || ''))).slice(0, MAX);

  const results: any[] = [];
  const work = async (o: (typeof targets)[number]) => {
    if (!o.pid) { results.push({ id: o.id, result: 'no_payment' }); return; }
    try {
      const r = await fetchClip(String(o.pid));
      if (!r.ok) {
        results.push({ id: o.id, result: 'error', error: r.data?.message || r.data?.error || `Clip respondió ${r.status}`, http: r.status });
        return;
      }
      const f = clipFields(r.data);
      if (!f.clip_payment_id) f.clip_payment_id = String(o.pid);
      const patch: Record<string, unknown> = { ...f };
      let promoted = false;
      let status = o.status || 'pending';
      const mismatch = f.clip_amount != null && Math.abs(Number(f.clip_amount) - Number(o.total || 0)) > 0.01;
      // Aprobado por Clip con el monto correcto → pagado (también si se había cancelado por error)
      if (f.clip_status === 'approved' && !mismatch && ['pending', 'cancelled'].includes(status)) {
        patch.status = 'paid';
        patch.internal_note = null;
        patch.payment_info = { ...(o.payment_info || {}), provider: 'clip', transaction_id: f.clip_payment_id, receipt_no: f.clip_receipt_no, paid_at: f.clip_approved_at || new Date().toISOString() };
        promoted = true;
        status = 'paid';
      } else if (FAIL.includes(String(f.clip_status)) && status === 'pending') {
        // Clip ya lo rechazó o canceló (p. ej. no se completó la autorización del banco) → cancelado
        patch.status = 'cancelled';
        patch.internal_note = `Clip: ${f.clip_status}${f.clip_status_code ? ` (${f.clip_status_code})` : ''}`;
        status = 'cancelled';
      }
      const { error: upErr } = await db.from('orders').update(patch).eq('id', o.id);
      if (upErr) { results.push({ id: o.id, result: 'error', error: upErr.message }); return; }
      if (promoted) await notifyPaid(req, o.id);
      const { clip_raw: _raw, ...fields } = f;
      results.push({ id: o.id, result: 'ok', promoted, mismatch, status, ...fields });
    } catch (e: any) {
      results.push({ id: o.id, result: 'error', error: e?.message || 'Error consultando Clip' });
    }
  };

  // De 6 en 6 para no saturar a Clip ni pasar el tiempo límite de Vercel
  for (let i = 0; i < targets.length; i += 6) await Promise.all(targets.slice(i, i + 6).map(work));

  return res.status(200).json({
    checked: results.length,
    ok: results.filter(r => r.result === 'ok').length,
    errors: results.filter(r => r.result === 'error').length,
    results,
  });
}
