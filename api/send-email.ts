import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

// admin@ es quien ENVÍA — info@ es quien RECIBE todo
// Configuración de SMTP con variables de entorno para flexibilidad y corrección de host
const transporter = nodemailer.createTransport({
  pool: true, 
  maxConnections: 1, // Límite estricto de 1 conexión para evitar bloqueos de HostGator
  maxMessages: Infinity, 
  host: process.env.SMTP_HOST || 'mail.divinastore.com.mx',
  port: Number(process.env.SMTP_PORT) || 465, // Cambiado a 465 (SSL) que suele ser más estable en HostGator
  secure: true, // true para puerto 465
  auth: {
    user: process.env.SMTP_USER || 'admin@divinastore.com.mx',
    pass: process.env.SMTP_PASS, 
  },
  tls: { 
    rejectUnauthorized: false
  },
  connectionTimeout: 60000, 
  greetingTimeout: 60000,
  socketTimeout: 60000,
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const FROM = process.env.SMTP_FROM || '"Divina Store MX" <admin@divinastore.com.mx>';
const TO   = process.env.SMTP_TO || 'info@divinastore.com.mx';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // DIAGNÓSTICO: Verificar que las variables existan
  const config = {
    host: process.env.SMTP_HOST || 'mail.divinastore.com.mx',
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER || 'admin@divinastore.com.mx',
    pass: process.env.SMTP_PASS ? '***(Configurada)***' : 'MISSING',
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465
  };

  const { type, firstName, email, message, subscribe } = req.body || {};

  // MODO TEST: Solo para verificar conexión
  if (type === 'test') {
    try {
      await transporter.verify();
      return res.status(200).json({ ok: true, message: '¡Conexión SMTP exitosa!', config });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: 'Error de conexión: ' + err.message, config });
    }
  }

  // Validar contraseña antes de seguir
  if (!process.env.SMTP_PASS) {
    return res.status(500).json({ ok: false, error: 'Falta la variable SMTP_PASS en Vercel.', config });
  }

  try {
    if (type === 'contact') {
      await transporter.sendMail({
        from: '"Sitio Web Divina" <admin@divinastore.com.mx>',
        to: TO,
        replyTo: email, 
        subject: `📩 Nuevo contacto — ${firstName || email}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="border-bottom:3px solid #c4fc15;padding-bottom:8px;color:#000">Nuevo mensaje de contacto</h2>
            <p><strong>Nombre:</strong> ${firstName || 'No proporcionado'}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Mensaje:</strong></p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:8px 0">${message || ''}</div>
            <p><strong>¿Quiere registrarse?</strong> ${subscribe ? '✅ Sí' : '❌ No'}</p>
            <hr style="margin-top:30px"/>
            <p style="color:#999;font-size:11px">Divina Store MX · Notificación Automática</p>
          </div>
        `,
      });
    }

    if (type === 'newsletter') {
      await transporter.sendMail({
        from: '"Sitio Web Divina" <admin@divinastore.com.mx>',
        to: TO,
        replyTo: email,
        subject: `📧 Nuevo suscriptor — ${firstName || email}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="border-bottom:3px solid #c4fc15;padding-bottom:8px;color:#000">Nuevo suscriptor al Newsletter</h2>
            <p><strong>Nombre:</strong> ${firstName || 'No proporcionado'}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <hr style="margin-top:30px"/>
            <p style="color:#999;font-size:11px">Divina Store MX · Notificación Automática</p>
          </div>
        `,
      });
    }

    if (type === 'campaign') {
      const { to, subject, htmlBody } = req.body;
      if (!to) throw new Error('No recipient specified');

      await transporter.sendMail({
        from: FROM,
        to: to,
        subject: subject || 'Divina Store Newsletter',
        html: htmlBody,
      });
      console.log(`Campaign email sent to ${to}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('Email error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Error desconocido', config });
  }
}
