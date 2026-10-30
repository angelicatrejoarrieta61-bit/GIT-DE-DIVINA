import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { SHIPPING_COST, FREE_SHIPPING_FROM } from '../src/lib/seoRules.js';

const UUID_RE = /^[0-9a-f-]{36}$/i;

function serviceDb() {
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) return null;
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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
    | { ok: true; amount: number; skipped?: boolean }
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
    return { ok: true, amount: expected };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    const chargeAmount = (check as Extract<CheckoutCheck, { ok: true }>).amount;

    try {
        const clientIp = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || '127.0.0.1';

        const payload: Record<string, any> = {
            amount: parseFloat(chargeAmount.toFixed(2)),
            currency: 'MXN',
            description: description || `Divina Store - Orden ${orderId}`,
            payment_method: {
                token: cardTokenId,
            },
            customer: {
                ...(customerEmail && { email: customerEmail }),
            },
            installments: 1,
            location: { ip: clientIp },
            prevention_data: {
                user_agent: userAgent || 'unknown',
                ...(sessionId && { session_id: sessionId }),
            },
        };

        console.log('[charge-clip] Payload to Clip:', JSON.stringify({ ...payload, payment_method: { token: '***' } }));

        const response = await fetch('https://api.payclip.com/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));

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

        // Rechazado o con verificación del banco (3-D Secure, no se usa): no se cobró.
        // El pedido se cancela para que no quede "En proceso"; la clienta puede pagar con otra tarjeta.
        const reason = data?.decline_reason || data?.status_detail?.message || data?.message || data?.error_description || data?.description || data?.error || null;
        console.error('[charge-clip] No aprobado:', response.status, status, data?.status_detail?.code, reason);
        await cancelUnpaid(String(orderId), status === 'pending' ? 'Banco pidió 3-D Secure (no disponible)' : `Pago rechazado${reason ? `: ${String(reason).slice(0, 160)}` : ''}`);
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
