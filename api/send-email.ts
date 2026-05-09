import type { VercelRequest, VercelResponse } from '@vercel/node';

const RESEND_API = 'https://api.resend.com/emails';
const FROM = 'Divina Store MX <onboarding@resend.dev>'; // Reemplazar por tu dominio verificado cuando lo tengas
const TO = 'info@divinastore.com.mx';

async function sendEmail(payload: {
  from: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
}) {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: payload.from,
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      reply_to: payload.replyTo,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.message || data?.name || `Resend error ${res.status}`);
  }

  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'RESEND_API_KEY no configurada en Vercel Environment Variables',
    });
  }

  const { type, firstName, email, message, subscribe, to, subject, htmlBody } = req.body || {};

  // ── MODO TEST — envia correo real de prueba ──
  if (type === 'test') {
    try {
      await sendEmail({
        from: FROM,
        to: TO,
        subject: 'Test de conexion Divina Store',
        html: '<p>Conexion con Resend exitosa. Correo de prueba automatico.</p>',
      });
      return res.status(200).json({
        ok: true,
        message: 'Conexion Resend exitosa — correo de prueba enviado a ' + TO,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  try {
    // ── CONTACTO — formulario del sitio ──
    if (type === 'contact') {
      if (!email) return res.status(400).json({ ok: false, error: 'Campo email requerido' });

      await sendEmail({
        from: FROM,
        to: TO,
        replyTo: email,
        subject: `Nuevo contacto - ${firstName || email}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="border-bottom:3px solid #c4fc15;padding-bottom:8px;color:#000;">
              Nuevo mensaje de contacto
            </h2>
            <p><strong>Nombre:</strong> ${firstName || 'No proporcionado'}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Mensaje:</strong></p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:8px 0;">
              ${message || 'Sin mensaje'}
            </div>
            <p><strong>Desea suscribirse:</strong> ${subscribe ? 'Si' : 'No'}</p>
            <hr style="margin-top:30px;"/>
            <p style="color:#999;font-size:11px;">Divina Store MX — Notificacion Automatica</p>
          </div>
        `,
      });
    }

    // ── NEWSLETTER — nuevo suscriptor desde el sitio ──
    if (type === 'newsletter') {
      if (!email) return res.status(400).json({ ok: false, error: 'Campo email requerido' });

      await sendEmail({
        from: FROM,
        to: TO,
        replyTo: email,
        subject: `Nuevo suscriptor - ${firstName || email}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="border-bottom:3px solid #c4fc15;padding-bottom:8px;color:#000;">
              Nuevo suscriptor al Newsletter
            </h2>
            <p><strong>Nombre:</strong> ${firstName || 'No proporcionado'}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <hr style="margin-top:30px;"/>
            <p style="color:#999;font-size:11px;">Divina Store MX — Notificacion Automatica</p>
          </div>
        `,
      });
    }

    // ── CAMPAIGN — envio masivo desde AdminNewsletter ──
    if (type === 'campaign') {
      if (!to) return res.status(400).json({ ok: false, error: 'Campo to requerido' });
      if (!htmlBody) return res.status(400).json({ ok: false, error: 'Campo htmlBody requerido' });

      await sendEmail({
        from: FROM,
        to: to,
        subject: subject || 'Novedades de Divina Store',
        html: htmlBody,
      });
    }

    return res.status(200).json({ ok: true });

  } catch (err: any) {
    console.error('[send-email] Error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Error desconocido',
    });
  }
}
