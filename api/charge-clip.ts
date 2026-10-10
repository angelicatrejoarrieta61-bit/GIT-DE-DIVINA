import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, description, orderId, cardTokenId, userAgent, sessionId, customerEmail } = req.body;

    if (!amount || !orderId || !cardTokenId) {
        return res.status(400).json({ error: `Faltan parámetros. amount=${amount} orderId=${orderId} cardTokenId=${cardTokenId}` });
    }

    const apiKey = process.env.CLIP_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'CLIP_API_KEY no configurada en Vercel' });
    }

    try {
        const clientIp = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() || '127.0.0.1';

        const payload: Record<string, any> = {
            amount: parseFloat(Number(amount).toFixed(2)),
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

        if (status === 'pending' && data?.pending_action?.url) {
            console.warn('[charge-clip] 3DS requerido:', data?.status_detail?.code);
            return res.status(400).json({
                error: 'Tu banco pidió una verificación adicional (3D Secure). Intenta con otra tarjeta o escríbenos por WhatsApp.',
                status,
                requires_3ds: true,
            });
        }

        console.error('[charge-clip] Clip declined/error:', response.status, JSON.stringify(data));
        return res.status(400).json({
            error: data.decline_reason || data.status_detail?.message || data.message || data.error_description || data.description || data.error || 'Pago declinado por el banco.',
            status: data.status,
        });

    } catch (err: any) {
        console.error('[charge-clip] Server error:', err.message);
        return res.status(500).json({ error: `Error interno: ${err.message}` });
    }
}
