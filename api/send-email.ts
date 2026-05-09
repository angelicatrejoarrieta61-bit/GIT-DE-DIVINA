import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const FROM = 'Divina Store MX <admin@divinastore.com.mx>';
const TO = 'info@divinastore.com.mx';

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

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { type, firstName, email, message, subscribe, to, subject, htmlBody } = req.body || {};

  // ── MODO TEST ──
  if (type === 'test') {
    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: [TO],
        subject: 'Test de conexion Divina Store',
        html: '<p>Conexion con Resend exitosa. Correo de prueba automatico.</p>',
      });
      if (error) throw new Error(error.message);
      return res.status(200).json({
        ok: true,
        message: 'Conexion Resend exitosa — correo de prueba enviado a ' + TO,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  try {
    // ── CONTACTO ──
    if (type === 'contact') {
      if (!email) return res.status(400).json({ ok: false, error: 'Campo email requerido' });

      const { error } = await resend.emails.send({
        from: FROM,
        to: [TO],
        reply_to: email,
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
      if (error) throw new Error(error.message);
    }

    // ── NEWSLETTER — nuevo suscriptor ──
    if (type === 'newsletter') {
      if (!email) return res.status(400).json({ ok: false, error: 'Campo email requerido' });

      const { error } = await resend.emails.send({
        from: FROM,
        to: [TO],
        reply_to: email,
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
      if (error) throw new Error(error.message);
    }

    // ── CAMPAIGN — envio masivo ──
    if (type === 'campaign') {
      if (!to) return res.status(400).json({ ok: false, error: 'Campo to requerido' });
      if (!htmlBody) return res.status(400).json({ ok: false, error: 'Campo htmlBody requerido' });

      const { error } = await resend.emails.send({
        from: FROM,
        to: [to],
        subject: subject || 'Novedades de Divina Store',
        html: htmlBody,
      });
      if (error) throw new Error(error.message);
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
