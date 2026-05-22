import type { VercelRequest, VercelResponse } from '@vercel/node';

const CLIP_API_KEY = process.env.CLIP_API_KEY ?? '';
const CLIP_API_URL = 'https://api-gw.payclip.com/charge';

interface CreatePaymentBody {
  amount: number;
  description: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  redirect_url: string;
  error_url: string;
}

function isValidBody(body: unknown): body is CreatePaymentBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.amount === 'number' &&
    b.amount > 0 &&
    typeof b.description === 'string' &&
    typeof b.orderId === 'string' &&
    typeof b.redirect_url === 'string' &&
    typeof b.error_url === 'string'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  // Verificar API key configurada
  if (!CLIP_API_KEY) {
    console.error('[create-payment] CLIP_API_KEY no configurada en variables de entorno.');
    return res.status(500).json({ error: 'Configuración de pagos incompleta.' });
  }

  // Validar body
  if (!isValidBody(req.body)) {
    return res.status(400).json({ error: 'Datos de pago inválidos o incompletos.' });
  }

  const {
    amount,
    description,
    orderId,
    customerName,
    customerEmail,
    redirect_url,
    error_url,
  } = req.body;

  try {
    const clipPayload = {
      amount: parseFloat(amount.toFixed(2)),
      currency: 'MXN',
      description,
      external_reference: orderId,
      redirect_url,
      error_url,
      customer: {
        name: customerName ?? 'Cliente',
        email: customerEmail ?? '',
      },
    };

    const clipRes = await fetch(CLIP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLIP_API_KEY,
      },
      body: JSON.stringify(clipPayload),
    });

    const clipData = await clipRes.json();

    if (!clipRes.ok) {
      console.error('[create-payment] Error de Clip:', clipData);
      return res.status(clipRes.status).json({
        error: clipData?.message ?? clipData?.error ?? 'Error al crear el pago en Clip.',
        detail: clipData,
      });
    }

    // Clip devuelve el URL del pago en payment_url o en body.payment_request_url
    const payment_url =
      clipData?.payment_url ??
      clipData?.payment_request_url ??
      clipData?.url ??
      null;

    if (!payment_url) {
      console.error('[create-payment] Clip no devolvió payment_url:', clipData);
      return res.status(502).json({
        error: 'Clip no devolvió una URL de pago. Verifica la configuración.',
        detail: clipData,
      });
    }

    return res.status(200).json({ payment_url });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno desconocido.';
    console.error('[create-payment] Exception:', message);
    return res.status(500).json({ error: message });
  }
}