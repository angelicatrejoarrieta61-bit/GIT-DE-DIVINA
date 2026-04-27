import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, description, orderId, redirect_url, error_url } = req.body;

    if (!amount || !description || !orderId) {
        return res.status(400).json({ error: 'Faltan parametros requeridos' });
    }

    const apiKey = process.env.CLIP_API_KEY;
    const secret = process.env.CLIP_SECRET;

    if (!apiKey || !secret) {
        return res.status(500).json({ error: 'Credenciales de Clip no configuradas' });
    }

    const basicToken = Buffer.from(`${apiKey}:${secret}`).toString('base64');

    try {
        const response = await fetch('https://api.payclip.com/v2/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${basicToken}`,
            },
            body: JSON.stringify({
                amount: parseFloat(Number(amount).toFixed(2)),
                currency: 'MXN',
                purchase_description: description.slice(0, 250),
                redirection_url: {
                    success: redirect_url || `${process.env.VITE_SITE_URL || ''}/pago-exitoso?order=${orderId}`,
                    error: error_url || `${process.env.VITE_SITE_URL || ''}/pago-error?order=${orderId}`,
                    cancel: error_url || `${process.env.VITE_SITE_URL || ''}/pago-error?order=${orderId}`,
                },
                metadata: {
                    external_reference: String(orderId),
                    customer_info: { order_id: String(orderId) },
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Clip API error:', JSON.stringify(data));
            return res.status(response.status).json({
                error: data.message || 'Error en Clip API',
            });
        }

        return res.status(200).json({ payment_url: data.payment_link_url });

    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}