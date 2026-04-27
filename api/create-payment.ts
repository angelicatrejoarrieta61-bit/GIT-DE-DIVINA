import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { amount, description, orderId, redirect_url, error_url } = req.body;

    if (!amount || !description || !orderId) {
        return res.status(400).json({ error: 'Faltan parametros requeridos' });
    }

    try {
        const response = await fetch('https://api.payclip.com/v2/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CLIP_API_KEY}`,
            },
            body: JSON.stringify({
                amount: parseFloat(amount.toFixed(2)),
                currency: 'MXN',
                purchase_description: description,
                redirection_url: {
                    success: redirect_url,
                    error: error_url,
                    cancel: error_url,
                },
                metadata: {
                    external_reference: String(orderId),
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Clip API error:', data);
            return res.status(response.status).json({ error: data.message || 'Error en Clip' });
        }

        return res.status(200).json({ payment_url: data.payment_link_url });

    } catch (err) {
        console.error('Server error:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
}