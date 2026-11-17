/**
 * /api/stripe — Cobro con Stripe Checkout (página de pago alojada por Stripe).
 *
 * POST { action: 'create', orderId, amount, couponCode?, customerEmail? }
 *   El servidor recalcula el total con precios de la base, crea la sesión de Stripe y devuelve { url }.
 *   El navegador redirige a esa url; Stripe cobra (tarjeta, 3-D Secure, Apple Pay / Google Pay si están activos).
 *   409 { code: 'price_changed' | 'unavailable' | 'already_paid' }   Igual que antes con Clip.
 * POST { action: 'status', orderId }
 *   Consulta a Stripe la sesión del pedido y deja el pedido como corresponde (respaldo del webhook).
 * POST { action: 'cancel', orderId }
 *   La clienta regresó sin pagar: se expira la sesión en Stripe y se cancela el pedido si sigue sin pagar.
 * POST (con encabezado Stripe-Signature)
 *   Webhook de Stripe. Firma verificada con STRIPE_WEBHOOK_SECRET. Eventos:
 *   checkout.session.completed · checkout.session.async_payment_succeeded ·
 *   checkout.session.async_payment_failed · checkout.session.expired
 *
 * Reglas:
 *   - Un pedido solo pasa a 'paid' si Stripe confirma payment_status = 'paid' con el monto correcto
 *     y la sesión pertenece a ese pedido. Nunca lo marca pagado el navegador.
 *   - Sin dependencias nuevas: usa la API REST de Stripe con fetch.
 *
 * Variables en Vercel: STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · SUPABASE_SERVICE_ROLE_KEY · SUPABASE_URL (o VITE_SUPABASE_URL)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SHIPPING_COST, FREE_SHIPPING_FROM } from '../src/lib/seoRules.js';

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PAID = ['paid', 'shipped', 'delivered'];
const STRIPE_API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_S = 300;

const r2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(n * 100);
const shortId = (id: string) => String(id).slice(0, 8).toUpperCase();

function serviceDb() {
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return null;
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function siteHost(req: VercelRequest) {
    return String(req.headers['x-forwarded-host'] || req.headers.host || 'www.divinastore.com.mx').split(',')[0].trim();
}

/* ───────────────────────── Stripe REST ───────────────────────── */

/** Codifica un objeto anidado como application/x-www-form-urlencoded con la notación de Stripe (a[b][c]=v). */
function formEncode(obj: Record<string, any>, prefix = ''): string[] {
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (Array.isArray(v)) {
            v.forEach((item, i) => {
                if (item !== null && typeof item === 'object') out.push(...formEncode(item, `${key}[${i}]`));
                else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
            });
        } else if (typeof v === 'object') {
            out.push(...formEncode(v, key));
        } else {
            out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
        }
    }
    return out;
}

async function stripeCall(method: 'GET' | 'POST', path: string, body?: Record<string, any>, idempotencyKey?: string) {
    const secret = process.env.STRIPE_SECRET_KEY || '';
    if (!secret) throw new Error('STRIPE_SECRET_KEY no está configurada en Vercel.');
    const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const r = await fetch(`${STRIPE_API}${path}`, {
        method,
        headers,
        body: method === 'POST' && body ? formEncode(body).join('&') : undefined,
    });
    const data: any = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
}

/* ───────────────────────── Verificación del total ───────────────────────── */

type CheckoutCheck =
    | { ok: true; amount: number; order: any }
    | { ok: false; status: number; body: Record<string, unknown> };

/**
 * El servidor recalcula el total con los precios ACTUALES de la base, el cupón validado y la regla de envío,
 * y confirma que cada producto se pueda vender. Nunca se cobra lo que diga el navegador.
 */
async function verifyCheckout(db: any, orderId: string, clientAmount: number, couponHint: unknown): Promise<CheckoutCheck> {
    const { data: order, error } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error || !order) return { ok: false, status: 404, body: { error: 'No se encontró la orden. Recarga la página.' } };
    if (PAID.includes(String(order.status))) {
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
    return { ok: true, amount: expected, order: { ...order, total: expected } };
}

/* ───────────────────────── Pedido ↔ sesión de Stripe ───────────────────────── */

/** Avisos de pedido pagado (el servidor de correo evita duplicados). */
async function notifyPaid(req: VercelRequest, orderId: string) {
    try {
        await fetch(`https://${siteHost(req)}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'order-paid', orderId }),
        });
    } catch (e: any) {
        console.error('[stripe] notifyPaid:', e?.message);
    }
}

function stripeFields(s: any) {
    const amount = Number(s?.amount_total);
    return {
        stripe_session_id: s?.id ?? null,
        stripe_payment_intent: typeof s?.payment_intent === 'string' ? s.payment_intent : s?.payment_intent?.id ?? null,
        stripe_status: s?.status ?? null,                    // open · complete · expired
        stripe_payment_status: s?.payment_status ?? null,    // paid · unpaid · no_payment_required
        stripe_amount: Number.isFinite(amount) ? amount / 100 : null,
        stripe_verified_at: new Date().toISOString(),
    };
}

/**
 * Aplica al pedido el estado de su sesión de Stripe. Devuelve el estado final del pedido.
 * Lanza error si no se pudo escribir en la base (el webhook responde 500 y Stripe reintenta).
 */
async function applySession(req: VercelRequest, db: any, orderId: string, session: any): Promise<string> {
    const { data: o, error } = await db.from('orders').select('id,status,total,payment_info,stripe_session_id').eq('id', orderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!o) return 'not_found';

    // La sesión debe ser de este pedido
    const sessionOrder = session?.metadata?.order_id || session?.client_reference_id;
    if (sessionOrder !== orderId) {
        console.error('[stripe] la sesión no corresponde al pedido', session?.id, orderId);
        return String(o.status);
    }

    const f = stripeFields(session);
    const patch: Record<string, unknown> = { ...f };
    let status = String(o.status);
    const amountOk = session?.amount_total != null && Math.abs(Number(session.amount_total) - cents(Number(o.total || 0))) <= 50;
    const paidNow = session?.payment_status === 'paid';

    if (paidNow && amountOk && ['pending', 'cancelled'].includes(status)) {
        patch.status = 'paid';
        patch.internal_note = null;
        patch.stripe_paid_at = new Date().toISOString();
        patch.payment_info = {
            ...(o.payment_info || {}),
            provider: 'stripe',
            stripe_payment_intent: f.stripe_payment_intent,
            stripe_session_id: f.stripe_session_id,
            paid_at: patch.stripe_paid_at,
        };
        status = 'paid';
    } else if (paidNow && !amountOk && status === 'pending') {
        patch.internal_note = `Stripe cobró $${(Number(session.amount_total) / 100).toFixed(2)} y el pedido es de $${Number(o.total).toFixed(2)}: revisar antes de enviar.`;
    } else if (session?.status === 'expired' && status === 'pending') {
        patch.status = 'cancelled';
        patch.internal_note = 'Stripe: la sesión de pago venció sin pagarse.';
        status = 'cancelled';
    } else if (session?.status === 'complete' && session?.payment_status === 'unpaid' && status === 'pending') {
        patch.internal_note = 'Stripe: pago en proceso (método diferido).';
    }

    const { error: upErr } = await db.from('orders').update(patch).eq('id', orderId);
    if (upErr) throw new Error(upErr.message);
    if (status === 'paid' && o.status !== 'paid') await notifyPaid(req, orderId);
    return status;
}

async function cancelUnpaid(db: any, orderId: string, note: string) {
    try {
        await db.from('orders').update({ status: 'cancelled', internal_note: note }).eq('id', orderId).eq('status', 'pending');
    } catch (e: any) {
        console.error('[stripe] cancelUnpaid:', e?.message);
    }
}

/* ───────────────────────── Acciones ───────────────────────── */

async function handleCreate(req: VercelRequest, res: VercelResponse, db: any, body: any) {
    const { orderId, amount, couponCode, customerEmail } = body || {};
    if (!UUID_RE.test(String(orderId || '')) || !Number(amount)) {
        return res.status(400).json({ error: 'Faltan datos del pedido. Recarga la página.' });
    }

    const check = await verifyCheckout(db, String(orderId), Number(amount), couponCode).catch((e): CheckoutCheck => {
        console.error('[stripe] verifyCheckout:', e?.message);
        return { ok: false, status: 500, body: { error: 'No se pudo confirmar el total. Intenta de nuevo.' } };
    });
    if (check.ok === false) {
        if (check.status !== 404 && check.body.code !== 'already_paid') {
            await cancelUnpaid(db, String(orderId), `No se envió a Stripe: ${String(check.body.error || '').slice(0, 200)}`);
        }
        return res.status(check.status).json(check.body);
    }

    const order = check.order;
    const host = siteHost(req);
    const short = shortId(order.id);
    const summary = (Array.isArray(order.items) ? order.items : [])
        .map((it: any) => `${Math.max(1, Math.floor(Number(it?.quantity) || 1))} × ${it?.product?.name ?? 'Producto'}`)
        .join(', ')
        .slice(0, 480);
    const email = String(order.customer_email || customerEmail || '').trim();

    const params: Record<string, any> = {
        mode: 'payment',
        locale: 'es-419',
        client_reference_id: order.id,
        customer_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'mxn',
                unit_amount: cents(check.amount),
                product_data: { name: `Divina Store · Pedido ${short}`, description: summary || undefined },
            },
        }],
        metadata: { order_id: order.id },
        payment_intent_data: { description: `Divina Store · Pedido ${short}`, metadata: { order_id: order.id } },
        success_url: `https://${host}/pago-exitoso?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://${host}/checkout?pago=cancelado&order=${order.id}`,
    };

    let r;
    try {
        r = await stripeCall('POST', '/checkout/sessions', params, `divina-${order.id}-${cents(check.amount)}`);
    } catch (e: any) {
        console.error('[stripe] create:', e?.message);
        await cancelUnpaid(db, order.id, `Error al conectar con Stripe: ${String(e?.message || '').slice(0, 160)}`);
        return res.status(500).json({ error: 'No se pudo abrir el pago. Intenta de nuevo.' });
    }
    if (!r.ok || !r.data?.url) {
        const why = r.data?.error?.message || `HTTP ${r.status}`;
        console.error('[stripe] create:', r.status, why);
        await cancelUnpaid(db, order.id, `Stripe no creó la sesión: ${String(why).slice(0, 160)}`);
        return res.status(502).json({ error: 'No se pudo abrir el pago. Intenta de nuevo.' });
    }

    const { error: upErr } = await db.from('orders').update(stripeFields(r.data)).eq('id', order.id);
    if (upErr) console.error('[stripe] guardar sesión:', upErr.message);

    return res.status(200).json({ url: r.data.url });
}

async function handleStatus(req: VercelRequest, res: VercelResponse, db: any, body: any) {
    const orderId = String(body?.orderId || '');
    if (!UUID_RE.test(orderId)) return res.status(400).json({ error: 'Pedido inválido.' });
    const { data: o, error } = await db.from('orders').select('id,status,stripe_session_id').eq('id', orderId).maybeSingle();
    if (error || !o) return res.status(404).json({ error: 'No se encontró el pedido.' });
    if (PAID.includes(String(o.status)) || !o.stripe_session_id) return res.status(200).json({ ok: true, status: String(o.status) });

    try {
        const r = await stripeCall('GET', `/checkout/sessions/${encodeURIComponent(o.stripe_session_id)}`);
        if (!r.ok) return res.status(200).json({ ok: true, status: String(o.status), error: `Stripe respondió ${r.status}` });
        const status = await applySession(req, db, orderId, r.data);
        return res.status(200).json({ ok: true, status });
    } catch (e: any) {
        console.error('[stripe] status:', e?.message);
        return res.status(500).json({ error: 'No se pudo consultar el pago.' });
    }
}

async function handleCancel(_req: VercelRequest, res: VercelResponse, db: any, body: any) {
    const orderId = String(body?.orderId || '');
    if (!UUID_RE.test(orderId)) return res.status(400).json({ error: 'Pedido inválido.' });
    const { data: o } = await db.from('orders').select('id,status,stripe_session_id').eq('id', orderId).maybeSingle();
    if (!o) return res.status(404).json({ error: 'No se encontró el pedido.' });
    if (o.status !== 'pending') return res.status(200).json({ ok: true, status: String(o.status) });

    if (o.stripe_session_id) {
        try {
            const cur = await stripeCall('GET', `/checkout/sessions/${encodeURIComponent(o.stripe_session_id)}`);
            // Si en realidad sí pagó (p. ej. regresó con el botón Atrás después de pagar), no se cancela
            if (cur.ok && cur.data?.payment_status === 'paid') {
                const status = await applySession(_req, db, orderId, cur.data);
                return res.status(200).json({ ok: true, status });
            }
            if (cur.ok && cur.data?.status === 'open') {
                await stripeCall('POST', `/checkout/sessions/${encodeURIComponent(o.stripe_session_id)}/expire`);
            }
        } catch (e: any) {
            console.error('[stripe] cancel:', e?.message);
        }
    }
    await cancelUnpaid(db, orderId, 'La clienta regresó de Stripe sin pagar.');
    return res.status(200).json({ ok: true, status: 'cancelled' });
}

/* ───────────────────────── Webhook ───────────────────────── */

function verifySignature(raw: string, header: string, secret: string): boolean {
    const parts = header.split(',').map((p) => p.trim());
    const t = parts.find((p) => p.startsWith('t='))?.slice(2) || '';
    const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
    if (!t || !sigs.length) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > SIGNATURE_TOLERANCE_S) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex'), 'hex');
    return sigs.some((s) => {
        const got = Buffer.from(s, 'hex');
        return got.length === expected.length && timingSafeEqual(got, expected);
    });
}

async function handleWebhook(req: VercelRequest, res: VercelResponse, db: any, raw: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!secret) return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET no está configurada en Vercel.' });
    if (!verifySignature(raw, String(req.headers['stripe-signature'] || ''), secret)) {
        return res.status(400).json({ error: 'Firma inválida.' });
    }
    let event: any;
    try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'JSON inválido.' }); }

    const handled = [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
    ];
    if (!handled.includes(event?.type)) return res.status(200).json({ received: true, ignored: event?.type });

    const session = event.data?.object;
    const orderId = String(session?.metadata?.order_id || session?.client_reference_id || '');
    if (!UUID_RE.test(orderId)) return res.status(200).json({ received: true, ignored: 'sin pedido' });

    try {
        if (event.type === 'checkout.session.async_payment_failed') {
            await db.from('orders').update({ ...stripeFields(session), status: 'cancelled', internal_note: 'Stripe: el pago diferido falló.' })
                .eq('id', orderId).eq('status', 'pending');
            return res.status(200).json({ received: true, status: 'cancelled' });
        }
        const status = await applySession(req, db, orderId, session);
        return res.status(200).json({ received: true, status });
    } catch (e: any) {
        console.error('[stripe] webhook:', e?.message);
        return res.status(500).json({ error: 'No se pudo actualizar el pedido.' }); // Stripe reintenta
    }
}

/* ───────────────────────── Entrada ───────────────────────── */

async function readRawBody(req: VercelRequest): Promise<string> {
    const chunks: Buffer[] = [];
    try {
        for await (const chunk of req as any) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    } catch { /* sin stream */ }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
    const b: any = (req as any).body;
    if (typeof b === 'string') return b;
    if (Buffer.isBuffer(b)) return b.toString('utf8');
    return b ? JSON.stringify(b) : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const db = serviceDb();
    if (!db) return res.status(500).json({ error: 'Falta configuración del servidor (Supabase).' });

    // El cuerpo se lee crudo: el webhook necesita los bytes exactos para validar la firma
    const raw = await readRawBody(req);

    if (req.headers['stripe-signature']) return handleWebhook(req, res, db, raw);

    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return res.status(400).json({ error: 'Solicitud inválida.' }); }

    if (body?.action === 'create') return handleCreate(req, res, db, body);
    if (body?.action === 'status') return handleStatus(req, res, db, body);
    if (body?.action === 'cancel') return handleCancel(req, res, db, body);
    return res.status(400).json({ error: 'Acción no reconocida.' });
}
