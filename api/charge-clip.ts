import type { VercelRequest, VercelResponse } from '@vercel/node';

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

        console.log('[charge-clip] Payload to Clip:', JSON.stringify(payload));

        const response = await fetch('https://api.payclip.com/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok || data.status === 'declined' || data.status === 'ERROR') {
            console.error('[charge-clip] Clip declined/error:', response.status, JSON.stringify(data));
            return res.status(400).json({
                error: data.decline_reason || data.message || data.error_description || data.description || data.error || `Pago declinado por el banco.`,
                status: data.status,
                clip_raw: data,
            });
        }

        if (data.requires_action && data.redirect_url) {
            return res.status(200).json({
                success: true,
                requires_action: true,
                redirect_url: data.redirect_url,
                transaction_id: data.transaction_id || data.id,
            });
        }

        return res.status(200).json({
            success: true,
            transaction_id: data.transaction_id || data.id,
            status: data.status,
        });

    } catch (err: any) {
        console.error('[charge-clip] Server error:', err.message);
        return res.status(500).json({ error: `Error interno: ${err.message}` });
    }
}
