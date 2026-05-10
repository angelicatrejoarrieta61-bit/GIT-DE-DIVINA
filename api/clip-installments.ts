import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { amount, payment_method_id } = req.query;

  if (!amount || !payment_method_id) {
    return res.status(400).json({ error: 'Faltan parámetros (amount o payment_method_id)' });
  }

  try {
    const url = `${process.env.CLIP_API_URL}/payment_methods/installments?amount=${amount}&payment_method_id=${payment_method_id}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${process.env.CLIP_API_KEY}` },
    });

    const data = await response.json();
    if (!response.ok) return res.status(200).json({ installments: [] });

    // Normalizar respuesta para el frontend
    const installments = (data.installments || []).map((item: any) => ({
      months: item.months,
      type: item.type, // 'msi' | 'mci'
      monthly_amount: item.monthly_amount,
      total_amount: item.total_amount,
    }));

    return res.status(200).json({ installments });
  } catch (err) {
    console.error('[clip-installments]', err);
    return res.status(200).json({ installments: [] }); // Fallback silencioso
  }
}
