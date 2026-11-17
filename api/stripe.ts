/**
 * /api/stripe — Cobro con Stripe dentro del sitio (Payment Element + PaymentIntents).
 *
 * El formulario de tarjeta vive en el checkout de Divina (Stripe.js lo pinta en un iframe seguro:
 * la tarjeta nunca pasa por nuestro servidor). El banco pide 3-D Secure ahí mismo, en un modal.
 *
 * POST { action: 'create', orderId, amount, couponCode?, customerEmail? }
 *   El servidor recalcula el total con precios de la base y crea el PaymentIntent (MXN, solo tarjeta).
 *   Devuelve { client_secret, payment_intent, amount }. El navegador confirma el pago con Stripe.js.
 *   409 { code: 'price_changed' | 'unavailable' | 'already_paid' }   Igual que antes con Clip.
 * POST { action: 'status', orderId }
 *   Consulta a Stripe el PaymentIntent del pedido y deja el pedido como corresponde
 *   (aprobado y monto correcto → pagado + avisos; cancelado → cancelado). Respaldo del webhook.
 * POST { action: 'cancel', orderId, reason? }
 *   El pago falló o la clienta desistió: cancela el PaymentIntent (si aún se puede) y el pedido si sigue sin pagar.
 * POST (con encabezado Stripe-Signature)
 *   Webhook de Stripe, firma verificada con STRIPE_WEBHOOK_SECRET. Eventos:
 *   payment_intent.succeeded · payment_intent.payment_failed · payment_intent.canceled
 *
 * Reglas:
 *   - Un pedido solo pasa a 'paid' si Stripe reporta status = 'succeeded' con el monto correcto y el
 *     PaymentIntent pertenece a ese pedido (metadata.order_id). Nunca lo marca pagado el navegador.
 *   - Sin dependencias nuevas: usa la API REST de Stripe con fetch.
 *
 * Variables en Vercel: STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · SUPABASE_SERVICE_ROLE_KEY · SUPABASE_URL (o VITE_SUPABASE_URL)
 * En el navegador: VITE_STRIPE_PUBLISHABLE_KEY (pk_…), pública por diseño.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SHIPPING_COST, FREE_SHIPPING_FROM, SHIPPING_ACTIVE } from '../src/lib/seoRules.js';

/** Sin parseo automático: el webhook necesita los bytes EXACTOS que manda Stripe para validar la firma. */
export const config = { api: { bodyParser: false } };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const PAID = ['paid', 'shipped', 'delivered'];
const STRIPE_API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_S = 300;
/** Estados del PaymentIntent desde los que Stripe permite cancelarlo. */
const CANCELABLE = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture'];

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
    let shipType: string | null = null; let shipValue = 0; // cupón ENVIO*: descuenta del envío, no de productos
    const code = String(order.coupon_code || (typeof couponHint === 'string' ? couponHint : '') || '').toUpperCase().replace(/\s+/g, '');
    if (code) {
        const { data: v, error: vErr } = await db.rpc('validate_coupon', { p_code: code, p_subtotal: code.startsWith('ENVIO') ? null : subtotal });
        let type: string | null = null; let value = 0;
        if (vErr && (vErr.code === 'PGRST202' || vErr.code === '42883')) {
            if (code === 'DESCUENTO202610') { type = 'percent'; value = 10; }
        } else if (v && (v as any).valid) {
            type = (v as any).discount_type; value = Number((v as any).discount_value) || 0;
        }
        if (type && code.startsWith('ENVIO')) { shipType = type; shipValue = value; discount = 0; }
        else if (type) discount = r2(Math.min(type === 'percent' ? subtotal * Math.min(value, 100) / 100 : value, subtotal));
    }
    const products = r2(subtotal - discount);
    const baseShip = !SHIPPING_ACTIVE || products <= 0 || products >= FREE_SHIPPING_FROM ? 0 : SHIPPING_COST;
    const shipDisc = shipType && baseShip > 0 && shipValue > 0
        ? r2(Math.min(shipType === 'percent' ? baseShip * Math.min(shipValue, 100) / 100 : shipValue, baseShip)) : 0;
    const shipping = r2(baseShip - shipDisc);
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

/* ───────────────────────── Pedido ↔ PaymentIntent ───────────────────────── */

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

/** Marca/tarjeta y último error legibles, si Stripe los manda. */
function cardLabel(pi: any): string | null {
    const ch = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const card = ch?.payment_method_details?.card || pi?.payment_method?.card || null;
    if (!card) return null;
    return [String(card.brand || '').toUpperCase(), card.last4 ? `•••• ${card.last4}` : '', card.funding === 'debit' ? 'débito' : card.funding === 'credit' ? 'crédito' : '']
        .filter(Boolean).join(' · ') || null;
}

/**
 * Datos de Stripe del pedido. Se guardan dentro de `payment_info` (columna que ya existe),
 * así no hace falta ninguna migración de base de datos.
 */
function stripeInfo(existing: any, pi: any) {
    const amount = Number(pi?.amount);
    return {
        ...(existing && typeof existing === 'object' ? existing : {}),
        provider: 'stripe',
        stripe_payment_intent: pi?.id ?? null,
        stripe_status: pi?.status ?? null,   // requires_payment_method · requires_action · processing · succeeded · canceled
        stripe_amount: Number.isFinite(amount) ? amount / 100 : null,
        stripe_verified_at: new Date().toISOString(),
    };
}
const intentOf = (o: any): string | null => (o?.payment_info && typeof o.payment_info === 'object' ? o.payment_info.stripe_payment_intent : null) || null;

/**
 * Aplica al pedido el estado de su PaymentIntent. Devuelve el estado final del pedido.
 * Lanza error si no se pudo escribir en la base (el webhook responde 500 y Stripe reintenta).
 */
async function applyIntent(req: VercelRequest, db: any, orderId: string, pi: any): Promise<string> {
    const { data: o, error } = await db.from('orders').select('id,status,total,payment_info,items').eq('id', orderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!o) return 'not_found';

    // El cobro debe ser de este pedido
    if (pi?.metadata?.order_id !== orderId) {
        console.error('[stripe] el PaymentIntent no corresponde al pedido', pi?.id, orderId);
        return String(o.status);
    }

    const patch: Record<string, unknown> = { payment_info: stripeInfo(o.payment_info, pi) };
    let status = String(o.status);
    const received = Number(pi?.amount_received ?? pi?.amount ?? 0);
    const amountOk = Math.abs(received - cents(Number(o.total || 0))) <= 50;
    const card = cardLabel(pi);
    const lastErr = pi?.last_payment_error?.message || pi?.last_payment_error?.decline_code || null;

    if (pi?.status === 'succeeded' && amountOk && ['pending', 'cancelled'].includes(status)) {
        patch.status = 'paid';
        patch.internal_note = null;
        patch.payment_info = {
            ...stripeInfo(o.payment_info, pi),
            charge_id: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null,
            card,
            paid_at: new Date().toISOString(),
        };
        status = 'paid';
    } else if (pi?.status === 'succeeded' && !amountOk && status === 'pending') {
        patch.internal_note = `Stripe cobró $${(received / 100).toFixed(2)} y el pedido es de $${Number(o.total).toFixed(2)}: revisar antes de enviar.`;
    } else if (pi?.status === 'canceled' && status === 'pending') {
        patch.status = 'cancelled';
        patch.internal_note = `Stripe: pago cancelado${pi?.cancellation_reason ? ` (${pi.cancellation_reason})` : ''}.`;
        status = 'cancelled';
    } else if (pi?.status === 'processing' && status === 'pending') {
        patch.internal_note = 'Stripe: pago en proceso.';
    } else if (lastErr && status === 'pending') {
        patch.internal_note = `Stripe: ${String(lastErr).slice(0, 180)}`;
    }

    if (status === 'paid' && o.status !== 'paid') {
        // Condicionado al estado anterior: si dos avisos llegan a la vez, solo uno descuenta inventario y avisa
        const { data: upd, error: upErr } = await db.from('orders').update(patch).eq('id', orderId).in('status', ['pending', 'cancelled']).select('id');
        if (upErr) throw new Error(upErr.message);
        if (upd?.length) {
            await takeStock(db, Array.isArray(o.items) ? o.items : []);
            await notifyPaid(req, orderId);
        }
        return status;
    }
    const { error: upErr } = await db.from('orders').update(patch).eq('id', orderId);
    if (upErr) throw new Error(upErr.message);
    return status;
}

/** Descuenta del inventario lo vendido. Si el producto maneja `stock` y llega a 0, deja de mostrarse (in_stock=false). */
async function takeStock(db: any, items: any[]) {
    try {
        const qtyById = new Map<string, number>();
        for (const it of items) {
            const id = it?.product?.id;
            if (id) qtyById.set(String(id), (qtyById.get(String(id)) || 0) + Math.max(1, Math.floor(Number(it?.quantity) || 1)));
        }
        if (!qtyById.size) return;
        const { data: prods } = await db.from('products').select('*').in('id', [...qtyById.keys()]);
        for (const p of prods ?? []) {
            const qty = qtyById.get(String(p.id)) || 0;
            const patch: Record<string, unknown> = {};
            if (typeof p.stock === 'number' || (typeof p.stock === 'string' && p.stock !== '' && !Number.isNaN(Number(p.stock)))) {
                const left = Math.max(0, Number(p.stock) - qty);
                patch.stock = left;
                if (left === 0) patch.in_stock = false;
            } // sin cantidad registrada (stock vacío): no se toca, el producto sigue disponible
            if (Object.keys(patch).length) {
                const { error } = await db.from('products').update(patch).eq('id', p.id);
                if (error) console.error('[stripe] inventario', p.id, error.message);
            }
        }
    } catch (e: any) {
        console.error('[stripe] takeStock:', e?.message);
    }
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
    const short = shortId(order.id);
    const summary = (Array.isArray(order.items) ? order.items : [])
        .map((it: any) => `${Math.max(1, Math.floor(Number(it?.quantity) || 1))} × ${it?.product?.name ?? 'Producto'}`)
        .join(', ')
        .slice(0, 480);
    const email = String(order.customer_email || customerEmail || '').trim();
    const name = String(order.customer_name || '').trim().slice(0, 100);

    const params: Record<string, any> = {
        amount: cents(check.amount),
        currency: 'mxn',
        payment_method_types: ['card'],
        description: `Divina Store · Pedido ${short}${summary ? ` · ${summary}` : ''}`.slice(0, 500),
        metadata: { order_id: order.id, order_number: short },
        receipt_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
        // Datos de la clienta para el antifraude del banco (Radar): nombre, correo y domicilio del pedido
        shipping: name ? {
            name,
            phone: String(order.customer_phone || '').replace(/\D/g, '').slice(-10) || undefined,
            address: {
                line1: String(order.customer_address || '').slice(0, 200) || undefined,
                city: String(order.customer_city || '').slice(0, 80) || undefined,
                state: String(order.customer_state || '').slice(0, 60) || undefined,
                postal_code: /^\d{5}$/.test(String(order.customer_zip || '')) ? String(order.customer_zip) : undefined,
                country: 'MX',
            },
        } : undefined,
    };

    let r;
    try {
        r = await stripeCall('POST', '/payment_intents', params, `divina-pi-${order.id}-${cents(check.amount)}`);
    } catch (e: any) {
        console.error('[stripe] create:', e?.message);
        await cancelUnpaid(db, order.id, `Error al conectar con Stripe: ${String(e?.message || '').slice(0, 160)}`);
        return res.status(500).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' });
    }
    if (!r.ok || !r.data?.client_secret) {
        const why = r.data?.error?.message || `HTTP ${r.status}`;
        console.error('[stripe] create:', r.status, why);
        await cancelUnpaid(db, order.id, `Stripe no creó el cobro: ${String(why).slice(0, 160)}`);
        return res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' });
    }

    const { error: upErr } = await db.from('orders').update({ payment_info: stripeInfo(order.payment_info, r.data) }).eq('id', order.id);
    if (upErr) console.error('[stripe] guardar intent:', upErr.message);

    return res.status(200).json({ client_secret: r.data.client_secret, payment_intent: r.data.id, amount: check.amount });
}

async function getIntent(id: string) {
    return stripeCall('GET', `/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge`);
}

async function handleStatus(req: VercelRequest, res: VercelResponse, db: any, body: any) {
    const orderId = String(body?.orderId || '');
    if (!UUID_RE.test(orderId)) return res.status(400).json({ error: 'Pedido inválido.' });
    const { data: o, error } = await db.from('orders').select('id,status,payment_info').eq('id', orderId).maybeSingle();
    if (error) { console.error('[stripe status]', error.message); return res.status(500).json({ error: 'No se pudo leer el pedido: ' + error.message }); }
    if (!o) return res.status(404).json({ error: 'No se encontró el pedido.' });
    if (PAID.includes(String(o.status))) return res.status(200).json({ ok: true, status: String(o.status) });

    try {
        let piId = intentOf(o);
        if (!piId) {
            // Sin id guardado: se busca en Stripe el cobro de este pedido (metadata.order_id)
            const found = await stripeCall('GET', `/payment_intents/search?query=${encodeURIComponent(`metadata['order_id']:'${orderId}'`)}&limit=1`);
            piId = found.ok ? (found.data?.data?.[0]?.id ?? null) : null;
            if (!piId) {
                // La búsqueda de Stripe puede tardar o no estar permitida: se revisan los cobros recientes
                const since = Math.floor(Date.now() / 1000) - 3 * 86400;
                const recent = await stripeCall('GET', `/payment_intents?limit=100&created[gte]=${since}`);
                const hit = recent.ok ? (recent.data?.data || []).find((x: any) => x?.metadata?.order_id === orderId) : null;
                piId = hit?.id ?? null;
            }
            if (!piId) {
                console.error('[stripe status] sin cobro encontrado', found.status, found.data?.error?.message);
                return res.status(200).json({ ok: true, status: String(o.status), diag: { stripe_search_http: found.status, stripe_error: found.data?.error?.message ?? null, encontrados: found.data?.data?.length ?? 0 } });
            }
        }
        const r = await getIntent(piId);
        if (!r.ok) return res.status(200).json({ ok: true, status: String(o.status), error: `Stripe respondió ${r.status}` });
        const status = await applyIntent(req, db, orderId, r.data);
        return res.status(200).json({ ok: true, status, stripe_status: r.data?.status ?? null });
    } catch (e: any) {
        console.error('[stripe] status:', e?.message);
        return res.status(500).json({ error: 'No se pudo consultar el pago.' });
    }
}

async function handleCancel(req: VercelRequest, res: VercelResponse, db: any, body: any) {
    const orderId = String(body?.orderId || '');
    if (!UUID_RE.test(orderId)) return res.status(400).json({ error: 'Pedido inválido.' });
    const reason = String(body?.reason || '').slice(0, 160);
    const { data: o } = await db.from('orders').select('id,status,payment_info').eq('id', orderId).maybeSingle();
    if (!o) return res.status(404).json({ error: 'No se encontró el pedido.' });
    if (o.status !== 'pending') return res.status(200).json({ ok: true, status: String(o.status) });

    if (intentOf(o)) {
        try {
            const cur = await getIntent(intentOf(o)!);
            // Si en realidad sí se cobró, no se cancela: se marca pagado
            if (cur.ok && cur.data?.status === 'succeeded') {
                const status = await applyIntent(req, db, orderId, cur.data);
                return res.status(200).json({ ok: true, status });
            }
            if (cur.ok && CANCELABLE.includes(String(cur.data?.status))) {
                await stripeCall('POST', `/payment_intents/${encodeURIComponent(intentOf(o)!)}/cancel`, { cancellation_reason: 'abandoned' });
            }
            if (cur.ok) await db.from('orders').update({ payment_info: stripeInfo(o.payment_info, { ...cur.data, status: 'canceled' }) }).eq('id', orderId);
        } catch (e: any) {
            console.error('[stripe] cancel:', e?.message);
        }
    }
    await cancelUnpaid(db, orderId, reason ? `Pago no completado: ${reason}` : 'Pago no completado.');
    return res.status(200).json({ ok: true, status: 'cancelled' });
}

/**
 * Red de seguridad: revisa los pedidos pendientes de los últimos 3 días contra Stripe y deja cada uno como
 * corresponde (pagado si Stripe cobró). Cubre a quien pagó y cerró la página, o un aviso (webhook) que no llegó.
 * Es seguro llamarla cuantas veces sea: solo copia lo que Stripe ya confirmó.
 */
async function handleReconcile(req: VercelRequest, res: VercelResponse, db: any) {
    const sinceIso = new Date(Date.now() - 3 * 86400_000).toISOString();
    const { data: pend, error } = await db.from('orders').select('id').eq('status', 'pending').gte('created_at', sinceIso).limit(200);
    if (error) return res.status(500).json({ error: 'No se pudo leer pedidos: ' + error.message });
    const ids = new Set((pend ?? []).map((o: any) => String(o.id)));
    if (!ids.size) return res.status(200).json({ ok: true, revisados: 0, pagados: 0 });

    const since = Math.floor(Date.now() / 1000) - 3 * 86400;
    let pagados = 0; let revisados = 0; let cursor = ''; const seen = new Set<string>();
    for (let page = 0; page < 5; page++) {
        const r = await stripeCall('GET', `/payment_intents?limit=100&created[gte]=${since}${cursor ? `&starting_after=${cursor}` : ''}`);
        if (!r.ok) return res.status(502).json({ error: 'Stripe respondió ' + r.status });
        const list: any[] = r.data?.data || [];
        for (const pi of list) {
            const oid = String(pi?.metadata?.order_id || '');
            if (!ids.has(oid) || seen.has(oid)) continue;
            // un pedido puede tener varios intentos: gana el cobrado
            if (pi.status !== 'succeeded' && list.some((x: any) => x?.metadata?.order_id === oid && x.status === 'succeeded')) continue;
            seen.add(oid); revisados++;
            try { if ((await applyIntent(req, db, oid, pi)) === 'paid') pagados++; } catch (e: any) { console.error('[stripe] reconcile', oid, e?.message); }
        }
        if (!r.data?.has_more || !list.length) break;
        cursor = list[list.length - 1].id;
    }
    return res.status(200).json({ ok: true, revisados, pagados });
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

    const handled = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled'];
    if (!handled.includes(event?.type)) return res.status(200).json({ received: true, ignored: event?.type });

    const pi = event.data?.object;
    const orderId = String(pi?.metadata?.order_id || '');
    if (!UUID_RE.test(orderId)) return res.status(200).json({ received: true, ignored: 'sin pedido' });

    try {
        const status = await applyIntent(req, db, orderId, pi);
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
    if (body?.action === 'reconcile') return handleReconcile(req, res, db);
    return res.status(400).json({ error: 'Acción no reconocida.' });
}
