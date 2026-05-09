import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

// ─────────────────────────────────────────────────────────────
// CRÍTICO: El transporter se crea DENTRO del handler.
// Vercel es serverless — no existe proceso persistente.
// Pool:true destruye la conexión antes de que termine el envío.
// ─────────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true, // Puerto 465 siempre requiere secure:true
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });
}

const FROM = process.env.SMTP_FROM || '"Divina Store MX" <admin@divinastore.com.mx>';
const TO = process.env.SMTP_TO || 'info@divinastore.com.mx';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Guard: verificar variables críticas antes de operar ──
  const missingVars: string[] = [];
  if (!process.env.SMTP_HOST) missingVars.push('SMTP_HOST');
  if (!process.env.SMTP_USER) missingVars.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missingVars.push('SMTP_PASS');

  if (missingVars.length > 0) {
    return res.status(500).json({
      ok: false,
      error: `Variables faltantes en Vercel Environment: ${missingVars.join(', ')}`,
    });
  }

  const { type, firstName, email, message, subscribe, to, subject, htmlBody } = req.body || {};
  const transporter = createTransporter();

  // ── MODO TEST — solo verifica conexión SMTP ──
  if (type === 'test') {
    try {
      await transporter.verify();
      transporter.close();
      return res.status(200).json({
        ok: true,
        message: 'Conexion SMTP exitosa',
        config: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || '465',
          user: process.env.SMTP_USER,
          pass: '***configurada***',
        },
      });
    } catch (err: any) {
      transporter.close();
      return res.status(500).json({
        ok: false,
        error: err.message,
        code: err.code || null,
        config: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || '465',
          user: process.env.SMTP_USER,
        },
      });
    }
  }

  try {
    // ── CONTACTO — formulario del sitio ──
    if (type === 'contact') {
      if (!email) {
        return res.status(400).json({ ok: false, error: 'Campo email requerido' });
      }

      await transporter.sendMail({
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
      if (!email) {
        return res.status(400).json({ ok: false, error: 'Campo email requerido' });
      }

      await transporter.sendMail({
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

    // ── CAMPAIGN — envío masivo desde AdminNewsletter ──
    if (type === 'campaign') {
      if (!to) {
        return res.status(400).json({ ok: false, error: 'Campo to (destinatario) requerido' });
      }
      if (!htmlBody) {
        return res.status(400).json({ ok: false, error: 'Campo htmlBody requerido' });
      }

      await transporter.sendMail({
        from: FROM,
        to: to,
        subject: subject || 'Novedades de Divina Store',
        html: htmlBody,
      });
    }

    // Cerrar conexión limpiamente — obligatorio en serverless
    transporter.close();

    return res.status(200).json({ ok: true });

  } catch (err: any) {
    console.error('[send-email] Error:', err);
    transporter.close();

    return res.status(500).json({
      ok: false,
      error: err.message || 'Error desconocido',
      code: err.code || null,
      responseCode: err.responseCode || null,
      command: err.command || null,
    });
  }
}