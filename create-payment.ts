import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS setup for preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { amount, description, orderId, redirect_url, error_url } = req.body;

  if (!amount || !description || !orderId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Las llaves de Clip estarán en Vercel como variables de entorno seguras
  const clipApiKey = process.env.CLIP_API_KEY;

  if (!clipApiKey) {
    return res.status(500).json({ error: 'CLIP_API_KEY no configurada en Vercel' });
  }

  try {
    const response = await fetch('https://api.clip.mx/v1/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': clipApiKey, // Clip usa x-api-key para autenticarse
      },
      body: JSON.stringify({
        amount: Number(amount),
        currency: 'MXN',
        purchase_description: description,
        custom_id: orderId,
        redirection_url: {
          success: redirect_url,
          error: error_url,
          default: redirect_url
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al generar checkout en Clip');
    }

    // Clip retorna el payment request URL, lo mandamos al frontend para redirigir
    return res.status(200).json({ payment_url: data.payment_request_url });
    
  } catch (error: any) {
    console.error('Clip Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
