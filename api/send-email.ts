import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

// Transportador SMTP — usa las variables de entorno en Vercel
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, firstName, email, message, subscribe } = req.body;

  try {
    if (type === 'contact') {
      // Notificación a admin
      await transporter.sendMail({
        from: `"Divina Store MX" <${process.env.SMTP_USER}>`,
        to: 'admin@divinastore.com.mx',
        subject: `📩 Nuevo mensaje de contacto — ${firstName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#000;border-bottom:2px solid #c4fc15;padding-bottom:8px">Nuevo mensaje de contacto</h2>
            <p><strong>Nombre:</strong> ${firstName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Mensaje:</strong></p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px">${message}</div>
            <p><strong>¿Quiere registrarse?</strong> ${subscribe ? 'Sí' : 'No'}</p>
            <hr/>
            <p style="color:#999;font-size:12px">Divina Store MX — admin@divinastore.com.mx</p>
          </div>
        `,
      });

      // Si se suscribió, notificar a info
      if (subscribe) {
        await transporter.sendMail({
          from: `"Divina Store MX" <${process.env.SMTP_USER}>`,
          to: 'info@divinastore.com.mx',
          subject: `🆕 Nuevo registro de suscriptor — ${firstName}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#000;border-bottom:2px solid #c4fc15;padding-bottom:8px">Nuevo suscriptor registrado</h2>
              <p><strong>Nombre:</strong> ${firstName}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><em>Este usuario se registró desde el formulario de contacto.</em></p>
              <hr/>
              <p style="color:#999;font-size:12px">Divina Store MX — info@divinastore.com.mx</p>
            </div>
          `,
        });
      }
    }

    if (type === 'newsletter') {
      // Registro de newsletter va a info
      await transporter.sendMail({
        from: `"Divina Store MX" <${process.env.SMTP_USER}>`,
        to: 'info@divinastore.com.mx',
        subject: `📧 Nuevo suscriptor newsletter — ${email}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#000;border-bottom:2px solid #c4fc15;padding-bottom:8px">Nuevo suscriptor al Newsletter</h2>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Nombre:</strong> ${firstName || 'No proporcionado'}</p>
            <p><em>Registrado desde el footer de la tienda.</em></p>
            <hr/>
            <p style="color:#999;font-size:12px">Divina Store MX — info@divinastore.com.mx</p>
          </div>
        `,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: err.message });
  }
}
