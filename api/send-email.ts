import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const FROM = 'Divina Store MX <admin@divinastore.com.mx>';
const TO = 'info@divinastore.com.mx';
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
  const { type, firstName, email, message, subscribe, to, subject, htmlBody, promoterCode, promoterLink } = req.body || {};

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
      if (error) throw new Error(error.message);
    }

    // ── NEWSLETTER — nuevo suscriptor ──
    if (type === 'newsletter') {
      if (!email) return res.status(400).json({ ok: false, error: 'Campo email requerido' });

      const { error } = await resend.emails.send({
        from: FROM,
        to: [TO],
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

    // PROMOTER WELCOME — confirmation, personal code and referral link
    if (type === 'promoter-welcome') {
      if (!email || !promoterCode || !promoterLink) {
        return res.status(400).json({ ok: false, error: 'Faltan datos del promotor' });
      }
      if (!/^[A-Z0-9-]{8,40}$/.test(String(promoterCode))) {
        return res.status(400).json({ ok: false, error: 'Código de promotor no válido' });
      }
      const safeName = escapeHtml(firstName || 'Promotor/a DIVINA');
      const safeEmail = escapeHtml(email);
      const safeCode = escapeHtml(promoterCode);
      const safeLink = `https://www.divinastore.com.mx/?ref=${encodeURIComponent(String(promoterCode))}`;
      const { error } = await resend.emails.send({
        from: FROM,
        to: [email],
        replyTo: TO,
        subject: `Ya estás dentro: tu código DIVINA es ${promoterCode}`,
        html: `
          <div style="margin:0;background:#070707;padding:32px 14px;font-family:Arial,sans-serif;color:#fff;">
            <div style="max-width:620px;margin:0 auto;background:#111;border:1px solid #2b2b2b;border-radius:20px;overflow:hidden;">
              <div style="height:8px;background:#c4fc15;"></div>
              <div style="padding:36px 32px;">
                <p style="color:#c4fc15;font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 16px;">PROGRAMA DE PROMOCIÓN DIVINA</p>
                <h1 style="font-size:32px;line-height:1.1;margin:0 0 18px;">¡Ya estás inscrito/a, ${safeName}!</h1>
                <p style="color:#b8b8b8;line-height:1.6;">Comparte tu código o liga personal. Cada venta pagada de cualquier producto te genera una comisión del <strong style="color:#fff;">12%</strong>.</p>
                <p style="font-size:12px;color:#888;margin:26px 0 7px;">TU CÓDIGO</p>
                <div style="padding:18px;border-radius:10px;background:#050505;border:1px solid #c4fc15;color:#c4fc15;font-size:22px;font-weight:800;letter-spacing:1px;text-align:center;">${safeCode}</div>
                <p style="font-size:12px;color:#888;margin:22px 0 7px;">TU LIGA PERSONAL</p>
                <a href="${safeLink}" style="display:block;padding:15px;border-radius:10px;background:#c4fc15;color:#000;font-weight:800;text-align:center;text-decoration:none;word-break:break-all;">${safeLink}</a>
                <div style="margin-top:28px;padding-top:24px;border-top:1px solid #292929;color:#aaa;font-size:13px;line-height:1.7;">
                  <strong style="color:#fff;">Recuerda:</strong> la venta debe estar pagada; pedidos cancelados o reembolsados no generan comisión. La atribución de tu liga dura 30 días.
                </div>
                <p style="font-size:12px;color:#777;margin-top:26px;">Este mensaje fue enviado a ${safeEmail}. Si necesitas ayuda, responde a este correo.</p>
              </div>
            </div>
          </div>`,
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
