import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const FROM = 'Divina Store MX <admin@divinastore.com.mx>';
const TO = 'info@divinastore.com.mx';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const getSupabaseConfig = () => ({
  url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, ''),
  anonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
});

async function hasAdminSession(req: VercelRequest) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { url, anonKey } = getSupabaseConfig();
  if (!token || !url || !anonKey) return false;
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(token);
  return !error && Boolean(data.user);
}

async function promoterExists(email: string, code: string) {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) throw new Error('Falta la configuración segura de Supabase en Vercel.');
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client
    .from('promoters')
    .select('id')
    .ilike('email', email.trim())
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}


// ── Pedidos ─────────────────────────────────────────────────────────
const ADMIN_URL = 'https://www.divinastore.com.mx/admin/reportes';
const money = (n: unknown) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
const shortId = (id: string) => String(id).slice(0, 8).toUpperCase();

function serviceClient() {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function itemsTable(items: any[]) {
  const rows = (Array.isArray(items) ? items : []).map((i) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(i?.quantity ?? 1)} × ${escapeHtml(i?.product?.name || 'Producto')}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${money((i?.product?.price || 0) * (i?.quantity || 1))}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`;
}

function addressBlock(o: any) {
  return [
    o.customer_address, o.customer_neighborhood,
    [o.customer_city, o.customer_state].filter(Boolean).join(', '),
    o.customer_zip ? `CP ${o.customer_zip}` : '', o.customer_reference ? `Ref: ${o.customer_reference}` : '',
  ].filter(Boolean).map(escapeHtml).join('<br>');
}

const shell = (inner: string) => `<div style="background:#f3f2ee;padding:28px 12px;font-family:Arial,sans-serif;color:#12261f">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e1da">
    <div style="background:#12261f;color:#efece6;padding:18px 24px;font-size:20px;letter-spacing:4px;font-weight:700">DIVINA</div>
    <div style="padding:24px">${inner}</div>
  </div>
  <p style="text-align:center;color:#8a8a8a;font-size:11px;margin-top:14px">Divina Store MX · divinastore.com.mx</p>
</div>`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY no está configurada en Vercel.' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { type, firstName, email, message, subscribe, to, subject, htmlBody, promoterCode, orderId } = req.body || {};

  if ((type === 'test' || type === 'campaign' || type === 'order-shipped') && !await hasAdminSession(req)) {
    return res.status(401).json({ ok: false, error: 'Se requiere una sesión de administrador.' });
  }

  try {
    if (type === 'test') {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: [TO],
        subject: 'Prueba de conexión Resend — Divina Store',
        html: '<p>La conexión de Divina Store con Resend funciona correctamente.</p>',
      });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id: data?.id, message: `Conexión con Resend exitosa. Correo enviado a ${TO}.` });
    }

    if (type === 'contact') {
      if (!email || !EMAIL_RE.test(String(email))) return res.status(400).json({ ok: false, error: 'Correo no válido.' });
      const safeEmail = escapeHtml(email);
      const { error } = await resend.emails.send({
        from: FROM,
        to: [TO],
        replyTo: String(email),
        subject: `Nuevo contacto - ${String(firstName || email).slice(0, 100)}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="border-bottom:3px solid #c4fc15;padding-bottom:8px">Nuevo mensaje de contacto</h2>
          <p><strong>Nombre:</strong> ${escapeHtml(firstName || 'No proporcionado')}</p>
          <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
          <p><strong>Mensaje:</strong></p><div style="background:#f5f5f5;padding:16px;border-radius:8px">${escapeHtml(message || 'Sin mensaje')}</div>
          <p><strong>Desea suscribirse:</strong> ${subscribe ? 'Sí' : 'No'}</p>
          <p style="color:#999;font-size:11px">Divina Store MX — notificación automática</p>
        </div>`,
      });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (type === 'newsletter') {
      if (!email || !EMAIL_RE.test(String(email))) return res.status(400).json({ ok: false, error: 'Correo no válido.' });
      const safeEmail = escapeHtml(email);
      const { error } = await resend.emails.send({
        from: FROM,
        to: [TO],
        replyTo: String(email),
        subject: `Nuevo suscriptor - ${String(firstName || email).slice(0, 100)}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="border-bottom:3px solid #c4fc15;padding-bottom:8px">Nuevo suscriptor al newsletter</h2>
          <p><strong>Nombre:</strong> ${escapeHtml(firstName || 'No proporcionado')}</p>
          <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
          <p style="color:#999;font-size:11px">Divina Store MX — notificación automática</p>
        </div>`,
      });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (type === 'campaign') {
      if (!to || !EMAIL_RE.test(String(to))) return res.status(400).json({ ok: false, error: 'Destinatario no válido.' });
      if (!htmlBody || String(htmlBody).length > 500_000) return res.status(400).json({ ok: false, error: 'Contenido de campaña no válido.' });
      const { error } = await resend.emails.send({
        from: FROM,
        to: [String(to)],
        subject: String(subject || 'Novedades de Divina Store').slice(0, 180),
        html: String(htmlBody),
      });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (type === 'promoter-welcome') {
      if (!email || !EMAIL_RE.test(String(email)) || !promoterCode) {
        return res.status(400).json({ ok: false, error: 'Faltan datos válidos del promotor.' });
      }
      const normalizedCode = String(promoterCode).trim().toUpperCase();
      if (!/^[A-Z0-9-]{8,40}$/.test(normalizedCode)) {
        return res.status(400).json({ ok: false, error: 'Código de promotor no válido.' });
      }
      if (!await promoterExists(String(email), normalizedCode)) {
        return res.status(403).json({ ok: false, error: 'El registro del promotor no coincide.' });
      }

      const safeName = escapeHtml(firstName || 'Promotor/a DIVINA');
      const safeEmail = escapeHtml(email);
      const safeCode = escapeHtml(normalizedCode);
      const safeLink = `https://divinastore.com.mx/?ref=${encodeURIComponent(normalizedCode)}`;
      const { error } = await resend.emails.send({
        from: FROM,
        to: [String(email)],
        replyTo: TO,
        subject: `Ya estás dentro: tu código DIVINA es ${normalizedCode}`,
        html: `<div style="margin:0;background:#070707;padding:32px 14px;font-family:Arial,sans-serif;color:#fff">
          <div style="max-width:620px;margin:0 auto;background:#111;border:1px solid #2b2b2b;border-radius:20px;overflow:hidden">
            <div style="height:8px;background:#c4fc15"></div><div style="padding:36px 32px">
              <p style="color:#c4fc15;font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 16px">PROGRAMA DE PROMOCIÓN DIVINA</p>
              <h1 style="font-size:32px;line-height:1.1;margin:0 0 18px">¡Ya estás inscrito/a, ${safeName}!</h1>
              <p style="color:#b8b8b8;line-height:1.6">Comparte tu código o liga personal. Cada venta pagada de cualquier producto te genera una comisión del <strong style="color:#fff">12%</strong>.</p>
              <p style="font-size:12px;color:#888;margin:26px 0 7px">TU CÓDIGO</p>
              <div style="padding:18px;border-radius:10px;background:#050505;border:1px solid #c4fc15;color:#c4fc15;font-size:22px;font-weight:800;letter-spacing:1px;text-align:center">${safeCode}</div>
              <p style="font-size:12px;color:#888;margin:22px 0 7px">TU LIGA PERSONAL</p>
              <a href="${safeLink}" style="display:block;padding:15px;border-radius:10px;background:#c4fc15;color:#000;font-weight:800;text-align:center;text-decoration:none;word-break:break-all">${safeLink}</a>
              <div style="margin-top:28px;padding-top:24px;border-top:1px solid #292929;color:#aaa;font-size:13px;line-height:1.7"><strong style="color:#fff">Recuerda:</strong> la venta debe estar pagada; pedidos cancelados o reembolsados no generan comisión. La atribución de tu liga dura 30 días.</div>
              <p style="font-size:12px;color:#777;margin-top:26px">Este mensaje fue enviado a ${safeEmail}. Si necesitas ayuda, responde a este correo.</p>
            </div>
          </div>
        </div>`,
      });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }


    // Aviso de pedido nuevo (a ti) + confirmación al cliente. Solo una vez por pedido,
    // y solo si el pedido ya está pagado en la base (no se puede disparar con cualquier id).
    if (type === 'order-paid') {
      if (!orderId || !/^[0-9a-f-]{36}$/i.test(String(orderId))) return res.status(400).json({ ok: false, error: 'Pedido no válido.' });
      const db = serviceClient();
      const { data: o, error: oErr } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (oErr) throw new Error(oErr.message);
      if (!o) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
      if (!['paid', 'shipped', 'delivered'].includes(o.status)) return res.status(409).json({ ok: false, error: 'El pedido aún no está pagado.' });
      if (!('admin_notified_at' in o)) return res.status(500).json({ ok: false, error: 'Falta ejecutar la migración de pedidos v2.' });

      const { data: cfgRows } = await db.from('store_config').select('key,value').eq('key', 'orders_notify_email');
      const notifyTo = String(cfgRows?.[0]?.value || 'admin@divinastore.com.mx')
        .split(',').map((x) => x.trim()).filter((x) => EMAIL_RE.test(x));

      const sent: string[] = [];
      if (!o.admin_notified_at && notifyTo.length) {
        const { error } = await resend.emails.send({
          from: FROM,
          to: notifyTo,
          replyTo: o.customer_email && EMAIL_RE.test(o.customer_email) ? o.customer_email : undefined,
          subject: `🛍️ Pedido nuevo #${shortId(o.id)} — ${money(o.total)}`,
          html: shell(`
            <p style="margin:0 0 4px;color:#7d916b;font-size:12px;letter-spacing:2px;font-weight:700">PEDIDO NUEVO · PAGADO</p>
            <h1 style="margin:0 0 16px;font-size:26px">#${shortId(o.id)} · ${money(o.total)}</h1>
            ${itemsTable(o.items)}
            <h3 style="margin:22px 0 6px;font-size:14px">Cliente</h3>
            <p style="margin:0;font-size:14px;line-height:1.6">${escapeHtml(o.customer_name || '—')}<br>${escapeHtml(o.customer_email || '')}<br>${escapeHtml(o.customer_phone || '')}</p>
            <h3 style="margin:18px 0 6px;font-size:14px">Enviar a</h3>
            <p style="margin:0;font-size:14px;line-height:1.6">${addressBlock(o)}</p>
            <a href="${ADMIN_URL}" style="display:inline-block;margin-top:22px;background:#12261f;color:#efece6;padding:12px 20px;border-radius:100px;text-decoration:none;font-weight:700;font-size:13px">Abrir en el admin</a>`),
        });
        if (error) throw new Error(error.message);
        await db.from('orders').update({ admin_notified_at: new Date().toISOString() }).eq('id', o.id);
        sent.push('admin');
      }

      if (!o.customer_notified_at && o.customer_email && EMAIL_RE.test(o.customer_email)) {
        const { error } = await resend.emails.send({
          from: FROM,
          to: [o.customer_email],
          replyTo: TO,
          subject: `Recibimos tu pedido #${shortId(o.id)} — Divina Store`,
          html: shell(`
            <h1 style="margin:0 0 8px;font-size:24px">¡Gracias, ${escapeHtml(String(o.customer_name || '').split(' ')[0] || 'por tu compra')}!</h1>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#444">Tu pago fue aprobado. Estamos preparando tu pedido y te escribiremos cuando salga, con tu número de guía.</p>
            ${itemsTable(o.items)}
            <p style="text-align:right;font-size:16px;font-weight:700;margin:12px 0 0">Total: ${money(o.total)}</p>
            <h3 style="margin:22px 0 6px;font-size:14px">Lo enviaremos a</h3>
            <p style="margin:0;font-size:14px;line-height:1.6">${addressBlock(o)}</p>
            <p style="margin:22px 0 0;font-size:13px;color:#666">Pedido #${shortId(o.id)}. ¿Dudas? Responde a este correo.</p>`),
        });
        if (!error) {
          await db.from('orders').update({ customer_notified_at: new Date().toISOString() }).eq('id', o.id);
          sent.push('cliente');
        }
      }
      return res.status(200).json({ ok: true, sent });
    }

    // Aviso de envío al cliente, con paquetería y guía (lo dispara el admin).
    if (type === 'order-shipped') {
      if (!orderId || !/^[0-9a-f-]{36}$/i.test(String(orderId))) return res.status(400).json({ ok: false, error: 'Pedido no válido.' });
      const db = serviceClient();
      const { data: o, error: oErr } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (oErr) throw new Error(oErr.message);
      if (!o) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
      if (!o.customer_email || !EMAIL_RE.test(o.customer_email)) return res.status(400).json({ ok: false, error: 'El pedido no tiene un correo válido.' });
      const link = o.tracking_url && /^https?:\/\//i.test(o.tracking_url) ? String(o.tracking_url) : '';
      const { error } = await resend.emails.send({
        from: FROM,
        to: [o.customer_email],
        replyTo: TO,
        subject: `Tu pedido #${shortId(o.id)} va en camino 🚚`,
        html: shell(`
          <h1 style="margin:0 0 8px;font-size:24px">¡Tu pedido va en camino!</h1>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#444">Hola ${escapeHtml(String(o.customer_name || '').split(' ')[0] || '')}, ya enviamos tu pedido #${shortId(o.id)}.</p>
          <div style="background:#f3f2ee;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.7">
            <strong>Paquetería:</strong> ${escapeHtml(o.shipping_carrier || '—')}<br>
            <strong>Número de guía:</strong> ${escapeHtml(o.tracking_number || '—')}
          </div>
          ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;margin-top:18px;background:#12261f;color:#efece6;padding:12px 20px;border-radius:100px;text-decoration:none;font-weight:700;font-size:13px">Rastrear mi pedido</a>` : ''}
          <h3 style="margin:22px 0 6px;font-size:14px">Contenido</h3>
          ${itemsTable(o.items)}
          <p style="margin:22px 0 0;font-size:13px;color:#666">¿Dudas? Responde a este correo.</p>`),
      });
      if (error) throw new Error(error.message);
      await db.from('orders').update({ shipping_notified_at: new Date().toISOString() }).eq('id', o.id);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Tipo de correo no reconocido.' });
  } catch (err: any) {
    console.error('[send-email] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'No se pudo enviar el correo.' });
  }
}
