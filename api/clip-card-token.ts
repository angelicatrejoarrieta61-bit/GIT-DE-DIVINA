import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { card_number, card_holder_name, expiration_month, expiration_year, cvv } = req.body;

  if (!card_number || !card_holder_name || !expiration_month || !expiration_year || !cvv) {
    return res.status(400).json({ error: 'Faltan datos de la tarjeta' });
  }

  try {
    const response = await fetch(`${process.env.CLIP_API_URL_SECURE}/card_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CLIP_API_KEY}`,
      },
      body: JSON.stringify({ 
        card_number: card_number.replace(/\s/g, ''), 
        card_holder_name, 
        expiration_month, 
        expiration_year, 
        cvv 
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data.message || 'Error al tokenizar con Clip' });

    return res.status(200).json({ card_token_id: data.id });
  } catch (err) {
    console.error('[clip-card-token]', err);
    return res.status(500).json({ error: 'Error interno en el servidor de pagos' });
  }
}
