import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers para que el frontend pueda llamar a este endpoint
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { cardTokenId, amount, description, orderId } = req.body;

    if (!cardTokenId || !amount || !description || !orderId) {
        return res.status(400).json({ error: 'Faltan parametros requeridos' });
    }

    const apiKey = process.env.CLIP_API_KEY;
    const secret = process.env.CLIP_SECRET;

    if (!apiKey || !secret) {
        return res.status(500).json({ error: 'Credenciales de Clip no configuradas' });
    }

    const basicToken = Buffer.from(`${apiKey}:${secret}`).toString('base64');

    try {
        // Paso: Realizar el cargo con el Card Token ID que viene del SDK de Clip
        const response = await fetch('https://api.payclip.com/v2/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${basicToken}`,
            },
            body: JSON.stringify({
                amount: parseFloat(Number(amount).toFixed(2)),
                currency: 'MXN',
                description: description.slice(0, 250),
                card_token_id: cardTokenId,
                metadata: {
                    external_reference: String(orderId),
                    order_id: String(orderId),
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Clip API error:', JSON.stringify(data));
            return res.status(response.status).json({
                error: data.message || data.error || 'Error al procesar el pago con Clip',
            });
        }

        // Devolver el resultado del pago
        return res.status(200).json({
            success: true,
            paymentId: data.id || data.payment_id,
            status: data.status,
        });

    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}