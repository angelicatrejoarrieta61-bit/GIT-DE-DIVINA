import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { amount, description, orderId } = req.body;

    if (!amount || !orderId) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos (amount, orderId)' });
    }

    // Usamos las claves reales tal como están en Vercel
    const apiKey = process.env.CLIP_API_KEY;
    const secretKey = process.env.CLIP_SECRET;

    if (!apiKey || !secretKey) {
        return res.status(500).json({ error: 'Clip API Key o Secret no configuradas en el servidor' });
    }

    // Generamos el token de autenticación Basic en Base64 (API_KEY:SECRET)
    const authString = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

    try {
        const baseUrl = req.headers.origin || 'https://git-de-divina.vercel.app';
        const response = await fetch('https://api.clip.mx/v1/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authString}`,
            },
            body: JSON.stringify({
                amount: parseFloat(Number(amount).toFixed(2)),
                currency: 'MXN',
                purchase_description: description || `Orden ${orderId}`,
                custom_id: String(orderId),
                redirection_url: {
                    success: `${baseUrl}/pago-exitoso?order=${orderId}`,
                    error: `${baseUrl}/checkout?error=pago_rechazado`,
                    default: `${baseUrl}/pago-exitoso?order=${orderId}`
                }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Clip Checkout error:', response.status, data);
            return res.status(response.status).json({ 
                error: data.message || data.error || 'Error al generar el link de pago',
            });
        }

        return res.status(200).json({ 
            success: true, 
            payment_url: data.payment_request_url
        });

    } catch (err) {
        console.error('Server error charge-clip:', err);
        return res.status(500).json({ error: 'Error interno al procesar el cargo' });
    }
}
