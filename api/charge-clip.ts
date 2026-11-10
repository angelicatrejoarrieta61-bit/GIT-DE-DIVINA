/**
 * /api/charge-clip — Cobro con Clip (y confirmación del cobro).
 *
 * POST { amount, orderId, cardTokenId, ... }   Cobra el pedido. El total lo recalcula el servidor.
 *   200 { success: true }                          Clip aprobó → pedido pagado.
 *   202 { pending: true, action_url? }             El banco pide autorizar (3-D Secure): la clienta va a action_url
 *                                                  y regresa a /pago-exitoso?order=<id>. El pedido NO se cancela.
 *   402 { code: 'payment_failed' }                 Rechazado: no se cobró; el pedido se cancela.
 * POST { action: 'status', orderId }             Consulta a Clip el cobro de ese pedido (público; solo devuelve el estado).
 *                                                  Si Clip ya lo aprobó → pagado + avisos. Si Clip lo rechazó/canceló → cancelado.
 * POST { action: 'sweep' } + x-cron-token        Igual que 'status' para los cobros pendientes de las últimas 24 h (cron).
 *
 * Nunca se marca pagado un pedido que Clip no aprobó con el monto correcto.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { SHIPPING_COST, FREE_SHIPPING_FROM } from '../src/lib/seoRules.js';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const CLIP_FINAL_FAIL = ['rejected', 'cancelled', 'canceled', 'refunded', 'declined', 'expired'];

function serviceDb() {
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return null;
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function siteHost(req: VercelRequest) {
    return String(req.headers['x-forwarded-host'] || req.headers.host || 'www.divinastore.com.mx').split(',')[0].trim();
}

/** Campos clip_* a partir de la respuesta de Clip (POST/GET /payments). Sin el token de tarjeta. */
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

/** Liga de autorización del banco (3-D Secure) dentro de la respuesta de Clip, si viene. */
function pendingActionUrl(data: any): string | null {
    const seen = new Set<any>();
    const find = (v: any, depth: number): string | null => {
        if (v == null || depth > 4) return null;
        if (typeof v === 'string') return /^https:\/\//i.test(v.trim()) ? v.trim() : null;
        if (typeof v !== 'object' || seen.has(v)) return null;
        seen.add(v);
        for (const k of Object.keys(v)) {
            const hit = find(v[k], depth + 1);
            if (hit) return hit;
        }
        return null;
    };
    return find(data?.pending_action, 0) || find(data?.three_ds, 0) || find(data?.redirect_url, 0) || null;
}

/** Guarda el resultado del cobro en el pedido. Si Clip lo aprobó, marca el pedido como pagado. Si falla, el cobro no se afecta. */
async function saveClipResult(orderId: string, data: any) {
    try {
        const db = serviceDb();
        if (!db || !UUID_RE.test(orderId)) return;
        const fields = clipFields(data);
        const patch: Record<string, unknown> = { ...fields };
        if (fields.clip_status === 'approved') {
            patch.status = 'paid';
            patch.payment_info = { provider: 'clip', transaction_id: fields.clip_payment_id, receipt_no: fields.clip_receipt_no, paid_at: fields.clip_approved_at || new Date().toISOString() };
        } else if (fields.clip_status === 'pending') {
            patch.internal_note = 'Esperando autorización del banco (3-D Secure)';
        }
        const { error } = await db.from('orders').update(patch).eq('id', orderId);
        if (error) {
            // Si aún no se corrió la migración de Clip, al menos dejar el pedido pagado como antes.
            console.error('[charge-clip] saveClipResult:', error.message);
            if (fields.clip_status === 'approved') {
                await db.from('orders').update({ status: 'paid', payment_info: patch.payment_info }).eq('id', orderId);
            }
        }
    } catch (e: any) {
        console.error('[charge-clip] saveClipResult:', e?.message);
    }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const FAILED_MSG = 'Tu compra no fue satisfactoria. Intenta con otra tarjeta.';

/** Cancela un pedido que no se pudo cobrar (solo si sigue sin pagar). */
async function cancelUnpaid(orderId: string, note: string) {
    try {
        const db = serviceDb();
        if (!db || !UUID_RE.test(orderId)) return;
        await db.from('orders').update({ status: 'cancelled', internal_note: note }).eq('id', orderId).eq('status', 'pending');
    } catch (e: any) {
        console.error('[charge-clip] cancelUnpaid:', e?.message);
    }
}

type CheckoutCheck =
    | { ok: true; amount: number; order?: any; skipped?: boolean }
    | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Protección de la venta: el servidor recalcula el total con los precios ACTUALES de la base,
 * el cupón validado y la regla de envío, y confirma que cada producto se pueda vender.
 * Nunca se cobra lo que diga el navegador.
 */
async function verifyCheckout(orderId: string, clientAmount: number, couponHint: unknown): Promise<CheckoutCheck> {
    const db = serviceDb();
    if (!db || !UUID_RE.test(orderId)) {
        console.warn('[charge-clip] sin verificación del servidor (faltan variables o id inválido)');
        return { ok: true, amount: r2(clientAmount), skipped: true };
    }
    const { data: order, error } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error || !order) return { ok: false, status: 404, body: { error: 'No se encontró la orden. Recarga la página.' } };
    if (['paid', 'shipped', 'delivered'].includes(String(order.status))) {
        return { ok: false, status: 409, body: { error: 'Esta orden ya está pagada.', code: 'already_paid' } };
    }

    const items: any[] = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return { ok: false, status: 400, body: { error: 'La orden no tiene productos.' } };
    const ids = [...new Set(items.map((it) => it?.product?.id).filter(Boolean))];
    const { data: prods } = await db.from('products').select('*').in('id', ids);
    const byId = Object.fromEntries((prods ?? []).map((p: any) => [p.id, p]));

    const unavailable: string[] = [];
    let subtotal = 0;
    for (const it of items) {
        const p = byId[it?.product?.id];
        const qty = Math.max(1, Math.floor(Number(it?.quantity) || 1));
        if (!p || p.in_stock === false) { unavailable.push(it?.product?.name ?? 'Producto'); continue; }
        subtotal += Number(p.price) * qty;
    }
    subtotal = r2(subtotal);
    if (unavailable.length) {
        return { ok: false, status: 409, body: { error: `Ya no está disponible: ${unavailable.join(', ')}. Quítalo del carrito para continuar.`, code: 'unavailable', items: unavailable } };
    }

    // Cupón: el guardado en la orden o el que manda el carrito, siempre validado en la base
    let discount = 0;
    const code = String(order.coupon_code || (typeof couponHint === 'string' ? couponHint : '') || '').toUpperCase().replace(/\s+/g, '');
    if (code) {
        const { data: v, error: vErr } = await db.rpc('validate_coupon', { p_code: code, p_subtotal: subtotal });
        let type: string | null = null; let value = 0;
        if (vErr && (vErr.code === 'PGRST202' || vErr.code === '42883')) {
            if (code === 'DESCUENTO202610') { type = 'percent'; value = 10; }
        } else if (v && (v as any).valid) {
            type = (v as any).discount_type; value = Number((v as any).discount_value) || 0;
        }
        if (type) discount = r2(Math.min(type === 'percent' ? subtotal * Math.min(value, 100) / 100 : value, subtotal));
    }
    const products = r2(subtotal - discount);
    const shipping = products <= 0 ? 0 : products >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST;
    const expected = r2(products + shipping);

    if (Math.abs(expected - Number(clientAmount)) > 0.5) {
        await db.from('orders').update({ total: expected }).eq('id', orderId);
        return {
            ok: false, status: 409,
            body: { error: `El total cambió a $${expected.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (precios o cupón actualizados). Revisa tu carrito y vuelve a pagar.`, code: 'price_changed', expected },
        };
    }
    if (Math.abs(Number(order.total) - expected) > 0.009) await db.from('orders').update({ total: expected }).eq('id', orderId);
    return { ok: true, amount: expected, order };
}

/** Datos de la clienta para el antifraude del banco (nombre, teléfono y dirección del pedido). */
function customerFromOrder(order: any, fallbackEmail?: string) {
    const name = String(order?.customer_name || '').trim().replace(/\s+/g, ' ');
    const parts = name ? name.split(' ') : [];
    const first = parts.length > 1 ? parts.slice(0, Math.ceil(parts.length / 2)).join(' ') : (parts[0] || '');
    const last = parts.length > 1 ? parts.slice(Math.ceil(parts.length / 2)).join(' ') : '';
    const phone = String(order?.customer_phone || '').replace(/\D/g, '').slice(-10);
    const street = String(order?.customer_address || '').replace(/,\s*$/, '').trim();
    const email = String(order?.customer_email || fallbackEmail || '').trim();
    const c: Record<string, any> = {};
    if (email) c.email = email;
    if (first) c.first_name = first.slice(0, 60);
    if (last) c.last_name = last.slice(0, 60);
    if (phone.length === 10) c.phone = phone;
    const address: Record<string, string> = {};
    if (street) address.street = street.slice(0, 120);
    if (order?.customer_neighborhood) address.colony = String(order.customer_neighborhood).slice(0, 80);
    if (order?.customer_city) address.city = String(order.customer_city).slice(0, 80);
    if (order?.customer_state) address.state = String(order.customer_state).slice(0, 60);
    if (/^\d{5}$/.test(String(order?.customer_zip || ''))) address.postal_code = String(order.customer_zip);
    if (order?.customer_reference) address.reference = String(order.customer_reference).slice(0, 120);
    if (Object.keys(address).length) c.address = { ...address, country: 'MX' };
    return c;
}

async function postClip(apiKey: string, payload: Record<string, any>) {
    const response = await fetch('https://api.payclip.com/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

async function getClipPayment(paymentId: string) {
    const keys = [process.env.CLIP_API_KEY, process.env.CLIP_SECRET].filter((k, i, a): k is string => Boolean(k) && a.indexOf(k) === i);
    let last = { ok: false, status: 0, data: {} as any };
    for (const key of keys) {
        const r = await fetch(`https://api.payclip.com/payments/${encodeURIComponent(paymentId)}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
        });
        const data = await r.json().catch(() => ({}));
        last = { ok: r.ok, status: r.status, data };
        if (r.status !== 401 && r.status !== 403) break;
    }
    return last;
}

/** Avisos de pedido pagado (el servidor de correo evita duplicados). */
async function notifyPaid(req: VercelRequest, orderId: string) {
    try {
        await fetch(`https://${siteHost(req)}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'order-paid', orderId }),
        });
    } catch (e: any) {
        console.error('[charge-clip] notifyPaid:', e?.message);
    }
}

/** Consulta a Clip el cobro de un pedido y deja el pedido como corresponde. */
async function refreshOrder(req: VercelRequest, db: any, orderId: string) {
    const { data: o, error } = await db.from('orders').select('id,status,total,payment_info,clip_payment_id,clip_status').eq('id', orderId).maybeSingle();
    if (error || !o) return { found: false as const };
    const pid = o.clip_payment_id || o.payment_info?.transaction_id || null;
    if (['paid', 'shipped', 'delivered'].includes(String(o.status))) return { found: true as const, status: String(o.status), clip_status: o.clip_status ?? null };
    if (!pid) return { found: true as const, status: String(o.status), clip_status: o.clip_status ?? null };

    const r = await getClipPayment(String(pid));
    if (!r.ok) return { found: true as const, status: String(o.status), clip_status: o.clip_status ?? null, error: `Clip respondió ${r.status}` };

    const f = clipFields(r.data);
    if (!f.clip_payment_id) f.clip_payment_id = String(pid);
    const patch: Record<string, unknown> = { ...f };
    let status = String(o.status);
    const amountOk = f.clip_amount == null || Math.abs(Number(f.clip_amount) - Number(o.total || 0)) <= 0.5;

    if (f.clip_status === 'approved' && amountOk && ['pending', 'cancelled'].includes(status)) {
        patch.status = 'paid';
        patch.internal_note = null;
        patch.payment_info = { ...(o.payment_info || {}), provider: 'clip', transaction_id: f.clip_payment_id, receipt_no: f.clip_receipt_no, paid_at: f.clip_approved_at || new Date().toISOString() };
        status = 'paid';
    } else if (CLIP_FINAL_FAIL.includes(String(f.clip_status)) && status === 'pending') {
        patch.status = 'cancelled';
        patch.internal_note = `Clip: ${f.clip_status}${f.clip_status_code ? ` (${f.clip_status_code})` : ''}`;
        status = 'cancelled';
    }
    const { error: upErr } = await db.from('orders').update(patch).eq('id', orderId);
    if (upErr) {
        console.error('[charge-clip] refreshOrder:', upErr.message);
        return { found: true as const, status: String(o.status), clip_status: f.clip_status };
    }
    if (status === 'paid' && o.status !== 'paid') await notifyPaid(req, orderId);
    return { found: true as const, status, clip_status: f.clip_status };
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
    const orderId = String(req.body?.orderId || '');
    if (!UUID_RE.test(orderId)) return res.status(400).json({ error: 'Pedido inválido.' });
    const db = serviceDb();
    if (!db) return res.status(500).json({ error: 'Falta configuración del servidor.' });
    try {
        const r = await refreshOrder(req, db, orderId);
        if (!r.found) return res.status(404).json({ error: 'No se encontró el pedido.' });
        return res.status(200).json({ ok: true, status: r.status, clip_status: r.clip_status ?? null });
    } catch (e: any) {
        console.error('[charge-clip] status:', e?.message);
        return res.status(500).json({ error: 'No se pudo consultar el pago.' });
    }
}

async function handleSweep(req: VercelRequest, res: VercelResponse) {
    const db = serviceDb();
    if (!db) return res.status(500).json({ error: 'Falta configuración del servidor.' });
    const token = String(req.headers['x-cron-token'] || '');
    const { data: okToken } = token ? await db.rpc('sourcing_cron_token_ok', { p_token: token }) : { data: false };
    if (okToken !== true) return res.status(401).json({ error: 'No autorizado.' });
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: rows, error } = await db.from('orders').select('id')
        .eq('status', 'pending').eq('clip_status', 'pending').gte('created_at', since).limit(20);
    if (error) return res.status(200).json({ ok: true, checked: 0, skipped: error.message });
    const results = [];
    for (const row of rows || []) {
        try { results.push({ id: row.id, ...(await refreshOrder(req, db, row.id)) }); }
        catch (e: any) { results.push({ id: row.id, error: e?.message }); }
    }
    return res.status(200).json({ ok: true, checked: results.length, results });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (req.body?.action === 'status') return handleStatus(req, res);
    if (req.body?.action === 'sweep') return handleSweep(req, res);

    const { amount, description, orderId, cardTokenId, userAgent, sessionId, customerEmail, couponCode } = req.body;

    if (!amount || !orderId || !cardTokenId) {
        return res.status(400).json({ error: `Faltan parámetros. amount=${amount} orderId=${orderId} cardTokenId=${cardTokenId}` });
    }

    const apiKey = process.env.CLIP_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'CLIP_API_KEY no configurada en Vercel' });
    }

    const check: CheckoutCheck = await verifyCheckout(String(orderId), Number(amount), couponCode).catch((e): CheckoutCheck => {
        console.error('[charge-clip] verifyCheckout:', e?.message);
        return { ok: false, status: 500, body: { error: 'No se pudo confirmar el total. Intenta de nuevo.' } };
    });
    if (check.ok === false) {
        const fail = check as Extract<CheckoutCheck, { ok: false }>;
        return res.status(fail.status).json(fail.body);
    }
    const okCheck = check as Extract<CheckoutCheck, { ok: true }>;
    const chargeAmount = okCheck.amount;

    try {
        const clientIp = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || '127.0.0.1';
        const returnUrl = `https://${siteHost(req)}/pago-exitoso?order=${encodeURIComponent(String(orderId))}`;

        const base: Record<string, any> = {
            amount: parseFloat(chargeAmount.toFixed(2)),
            currency: 'MXN',
            description: description || `Divina Store - Orden ${orderId}`,
            payment_method: { token: cardTokenId },
            installments: 1,
            location: { ip: clientIp },
            prevention_data: {
                user_agent: userAgent || 'unknown',
                ...(sessionId && { session_id: sessionId }),
            },
        };

        // Completo: datos de la clienta (antifraude del banco) + a dónde regresa tras autorizar con su banco
        const full = {
            ...base,
            customer: customerFromOrder(okCheck.order, customerEmail),
            external_reference: String(orderId),
            return_url: returnUrl,
        };

        console.log('[charge-clip] Payload to Clip:', JSON.stringify({ ...full, payment_method: { token: '***' } }));
        let { response, data } = await postClip(apiKey, full);

        // Si Clip rechaza el formato de algún dato extra (sin crear el cobro), se reintenta con lo mínimo para no perder la venta
        if (!response.ok && !data?.id && (response.status === 400 || response.status === 422)) {
            console.warn('[charge-clip] Clip no aceptó el payload completo, reintento mínimo:', response.status, JSON.stringify(data).slice(0, 300));
            ({ response, data } = await postClip(apiKey, { ...base, customer: customerEmail ? { email: customerEmail } : {} }));
        }

        // Registrar en el pedido lo que respondió Clip (aprobado, pendiente o rechazado)
        if (data && (data.id || data.transaction_id || data.status)) {
            await saveClipResult(String(orderId), data);
        }

        const status = String(data?.status || '').toLowerCase();

        if (response.ok && status === 'approved') {
            return res.status(200).json({
                success: true,
                transaction_id: data.id || data.transaction_id,
                receipt_no: data.receipt_no ?? null,
                status,
            });
        }

        // El banco pide autorización (3-D Secure): NO se cancela. La clienta autoriza y el cobro se confirma con Clip.
        if (status === 'pending') {
            const actionUrl = pendingActionUrl(data);
            console.log('[charge-clip] Pendiente de autorización del banco:', data?.status_detail?.code, actionUrl ? 'con liga' : 'sin liga');
            return res.status(202).json({
                pending: true,
                code: 'bank_authorization',
                action_url: actionUrl,
                transaction_id: data.id || data.transaction_id || null,
            });
        }

        // Rechazado o error: no se cobró. El pedido se cancela para que no quede "En proceso".
        const reason = data?.decline_reason || data?.status_detail?.message || data?.message || data?.error_description || data?.description || data?.error || null;
        console.error('[charge-clip] No aprobado:', response.status, status, data?.status_detail?.code, reason);
        await cancelUnpaid(String(orderId), `Pago rechazado${data?.status_detail?.code ? ` (${data.status_detail.code})` : ''}${reason ? `: ${String(reason).slice(0, 160)}` : ''}`);
        return res.status(402).json({
            error: FAILED_MSG,
            code: 'payment_failed',
            status: data?.status ?? null,
            reason,
        });

    } catch (err: any) {
        console.error('[charge-clip] Server error:', err.message);
        await cancelUnpaid(String(orderId), `Error al cobrar: ${String(err?.message || '').slice(0, 160)}`);
        return res.status(500).json({ error: FAILED_MSG, code: 'payment_failed' });
    }
}
