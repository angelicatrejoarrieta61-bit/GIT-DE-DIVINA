import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { card_token_id, amount, customer, description, installments } = req.body;

  if (!card_token_id || !amount || !customer?.email) {
    return res.status(400).json({ error: 'Faltan datos críticos para procesar el pago' });
  }

  try {
    const body: Record<string, unknown> = {
      amount,
      currency: 'MXN',
      description: description || 'Compra en Divina Store',
      payment_method: { card_token_id },
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        ...(customer.address && { address: customer.address }),
      },
    };

    if (installments?.months) {
      body.installments = { months: installments.months, type: installments.type };
    }

    const response = await fetch(`${process.env.CLIP_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CLIP_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Guardar registro en Supabase (Auditoría de Transacciones)
    await supabase.from('transactions').insert({
      clip_payment_id: data.id || null,
      amount,
      currency: 'MXN',
      status: data.status || 'declined',
      description: description || 'Compra en Divina Store',
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      decline_reason: data.decline_reason || null,
      raw_response: data,
    });

    if (!response.ok || data.status === 'declined') {
      return res.status(400).json({
        success: false,
        status: data.status,
        decline_reason: data.decline_reason,
      });
    }

    // Soporte para 3DS si es requerido por el banco
    if (data.requires_action) {
      return res.status(200).json({
        requires_action: true,
        redirect_url: data.redirect_url,
      });
    }

    return res.status(200).json({
      success: true,
      transaction_id: data.id,
      status: data.status,
    });

  } catch (err) {
    console.error('[clip-payment]', err);
    return res.status(500).json({ error: 'Fallo en la comunicación con la pasarela de pagos' });
  }
}
