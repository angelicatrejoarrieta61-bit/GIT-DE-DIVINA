import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const evento = req.body;

  // Registro del evento para depuración
  console.log('[clip-webhook] Evento recibido:', evento);

  try {
    // Actualizar estado en Supabase basado en el payment_id de Clip
    if (evento?.payment_id && evento?.status) {
      const { error } = await supabase
        .from('transactions')
        .update({ 
          status: evento.status,
          raw_response: evento // Guardamos el detalle completo del evento
        })
        .eq('clip_payment_id', evento.payment_id);

      if (error) throw error;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[clip-webhook] Error al procesar:', err);
    return res.status(500).json({ error: 'Error al actualizar base de datos' });
  }
}
