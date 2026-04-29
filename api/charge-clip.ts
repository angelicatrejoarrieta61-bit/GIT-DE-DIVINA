import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, description, orderId, token } = req.body;

    if (!amount || !token || !orderId) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos (amount, token, orderId)' });
    }

    // Usamos el secret REAL del .env
    const secretKey = process.env.CLIP_SECRET || 'cf23db53-7f82-4174-a4e1-58164268b238';

    if (!secretKey) {
        return res.status(500).json({ error: 'Clip Secret Key no configurada en el servidor' });
    }

    try {
        // Clip acepta Bearer token para API keys
        const response = await fetch('https://api-gw.payclip.com/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${secretKey}`,
            },
            body: JSON.stringify({
                amount: parseFloat(Number(amount).toFixed(2)),
                currency: 'MXN',
                source: token,
                description: description || `Orden ${orderId}`,
                reference: String(orderId),
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Clip Payments API error:', response.status, JSON.stringify(data));
            return res.status(response.status).json({ 
                error: data.message || data.error || 'Error al procesar el pago con Clip',
                details: data,
                clipStatus: response.status,
            });
        }

        return res.status(200).json({ 
            success: true, 
            payment_id: data.id,
            status: data.status 
        });

    } catch (err) {
        console.error('Server error charge-clip:', err);
        return res.status(500).json({ error: 'Error interno al procesar el cargo' });
    }
}
