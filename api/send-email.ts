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


// ── Seguimiento: forma de entrega, correo al cliente y consulta del pedido ──
type Db = ReturnType<typeof serviceClient>;
const SITE = 'https://www.divinastore.com.mx';
const isMissingCol = (msg?: string | null) => !!msg && /column|schema cache|PGRST204/i.test(msg);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

/** Forma de entrega guardada en shipping_carrier: "Entrega personal", "Directo de: Amazon" o la paquetería. */
function deliveryOf(o: any): { kind: 'personal' | 'proveedor' | 'paqueteria' | null; label: string | null } {
  const c = String(o?.shipping_carrier || '').trim();
  if (!c) return { kind: null, label: null };
  if (/^entrega (personal|local)$/i.test(c)) return { kind: 'personal', label: 'Entrega personal' };
  const m = c.match(/^directo de:?\s*(.+)$/i);
  if (m) return { kind: 'proveedor', label: `Envío directo de ${m[1].trim()}` };
  return { kind: 'paqueteria', label: c };
}

/** Actualiza el pedido; si faltan columnas nuevas (migración pendiente) usa `fallback`. */
async function patchOrder(db: Db, id: string, patch: Record<string, unknown>, fallback?: Record<string, unknown>) {
  const { error } = await db.from('orders').update(patch).eq('id', id);
  if (error && isMissingCol(error.message) && fallback) await db.from('orders').update(fallback).eq('id', id);
  return error && !isMissingCol(error.message) ? error.message : null;
}

async function notifyList(db: Db) {
  const { data } = await db.from('store_config').select('key,value').eq('key', 'orders_notify_email');
  return String(data?.[0]?.value || 'admin@divinastore.com.mx').split(',').map((x) => x.trim()).filter((x) => EMAIL_RE.test(x));
}

const myOrderLink = (o: any) => `${SITE}/mi-pedido?id=${o.id}`;
const btn = (href: string, text: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:18px;background:#12261f;color:#efece6;padding:12px 20px;border-radius:100px;text-decoration:none;font-weight:700;font-size:13px">${escapeHtml(text)}</a>`;

function confirmationHtml(o: any) {
  return shell(`
    <h1 style="margin:0 0 8px;font-size:24px">¡Gracias, ${escapeHtml(String(o.customer_name || '').split(' ')[0] || 'por tu compra')}!</h1>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#444">Tu pago fue aprobado. Estamos preparando tu pedido y te escribiremos cuando salga, con la forma de entrega y, si aplica, tu número de guía.</p>
    ${itemsTable(o.items)}
    ${Number(o.discount_amount) > 0 ? `<p style="text-align:right;font-size:13px;margin:10px 0 0;color:#444">Descuento${o.coupon_code ? ` (${escapeHtml(o.coupon_code)})` : ''}: −${money(o.discount_amount)}</p>` : ''}
    <p style="text-align:right;font-size:16px;font-weight:700;margin:12px 0 0">Total: ${money(o.total)}</p>
    <h3 style="margin:22px 0 6px;font-size:14px">Lo enviaremos a</h3>
    <p style="margin:0;font-size:14px;line-height:1.6">${addressBlock(o)}</p>
    ${btn(myOrderLink(o), 'Ver mi pedido')}
    <p style="margin:22px 0 0;font-size:13px;color:#666">Pedido #${shortId(o.id)}. ¿Dudas? Responde a este correo.</p>`);
}

function shippedHtml(o: any) {
  const d = deliveryOf(o);
  const link = o.tracking_url && /^https?:\/\//i.test(o.tracking_url) ? String(o.tracking_url) : '';
  const first = escapeHtml(String(o.customer_name || '').split(' ')[0] || '');
  const head = d.kind === 'personal'
    ? `<h1 style="margin:0 0 8px;font-size:24px">¡Tu pedido va en camino!</h1>
       <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#444">Hola ${first}, tu pedido #${shortId(o.id)} te lo entregamos en persona. Te contactaremos para coordinar la entrega.</p>`
    : d.kind === 'proveedor'
      ? `<h1 style="margin:0 0 8px;font-size:24px">¡Tu pedido va en camino!</h1>
         <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#444">Hola ${first}, tu pedido #${shortId(o.id)} sale directo del almacén de la marca/distribuidor para que te llegue más rápido. Puede llegar con su empaque.</p>`
      : `<h1 style="margin:0 0 8px;font-size:24px">¡Tu pedido va en camino!</h1>
         <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#444">Hola ${first}, ya enviamos tu pedido #${shortId(o.id)}.</p>`;
  const box = o.tracking_number || d.kind === 'paqueteria'
    ? `<div style="background:#f3f2ee;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.7">
        <strong>Entrega:</strong> ${escapeHtml(d.label || '—')}<br>
        <strong>Número de guía:</strong> ${escapeHtml(o.tracking_number || '—')}
      </div>` : '';
  return shell(`${head}${box}
    ${link ? btn(link, 'Rastrear mi pedido') : btn(myOrderLink(o), 'Ver mi pedido')}
    <h3 style="margin:22px 0 6px;font-size:14px">Contenido</h3>
    ${itemsTable(o.items)}
    <p style="margin:22px 0 0;font-size:13px;color:#666">¿Dudas? Responde a este correo.</p>`);
}

/** Correo de confirmación al cliente con reintentos. Guarda el id de Resend para saber si llegó. */
async function sendConfirmation(resend: Resend, db: Db, o: any, maxTries = 3) {
  const tries0 = Number(o.customer_email_tries) || 0;
  let lastErr = '';
  for (let i = 0; i < maxTries; i += 1) {
    const { data, error } = await resend.emails.send({
      from: FROM, to: [o.customer_email], replyTo: TO,
      subject: `Recibimos tu pedido #${shortId(o.id)} — Divina Store`,
      html: confirmationHtml(o),
    });
    if (!error && data?.id) {
      const t = nowIso();
      await patchOrder(db, o.id,
        { customer_notified_at: t, customer_email_id: data.id, customer_email_status: 'sent', customer_email_tries: tries0 + i + 1, customer_email_checked_at: t },
        { customer_notified_at: t });
      return { ok: true as const, id: data.id };
    }
    lastErr = error?.message || 'Resend no respondió';
    if (i < maxTries - 1) await sleep(900 * (i + 1));
  }
  await patchOrder(db, o.id, { customer_email_status: 'error', customer_email_tries: tries0 + maxTries, customer_email_checked_at: nowIso() });
  return { ok: false as const, error: lastErr };
}

/** Te avisa una sola vez que el correo de confirmación no le llegó al cliente. */
async function alertNotDelivered(resend: Resend, db: Db, o: any, why: string) {
  if (o.customer_email_alerted_at) return;
  const to = await notifyList(db);
  if (!to.length) return;
  const { error } = await resend.emails.send({
    from: FROM, to,
    subject: `⚠️ El cliente no recibió la confirmación — pedido #${shortId(o.id)}`,
    html: shell(`
      <p style="margin:0 0 4px;color:#b4541a;font-size:12px;letter-spacing:2px;font-weight:700">CORREO NO ENTREGADO</p>
      <h1 style="margin:0 0 12px;font-size:22px">Pedido #${shortId(o.id)} · ${money(o.total)}</h1>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.6">${escapeHtml(why)}</p>
      <p style="margin:0;font-size:14px;line-height:1.6"><strong>${escapeHtml(o.customer_name || '—')}</strong><br>${escapeHtml(o.customer_email || '')}<br>${escapeHtml(o.customer_phone || '')}</p>
      <p style="margin:14px 0 0;font-size:13px;color:#444">Corrige el correo en Pedidos y pulsa <b>Reenviar confirmación</b>, o escríbele por WhatsApp.</p>
      ${btn(ADMIN_URL, 'Abrir en el admin')}`),
  });
  if (!error) await patchOrder(db, o.id, { customer_email_alerted_at: nowIso() });
}

const DELIVERED_EVENTS = ['delivered', 'opened', 'clicked'];
const FAILED_EVENTS = ['bounced', 'failed', 'complained', 'canceled'];

/**
 * Revisa en Resend si llegaron las confirmaciones de los últimos 7 días:
 * entregado → listo · error al enviar → reintenta (hasta 6) · rebotó → 1 reintento y luego te avisa.
 */
async function checkConfirmations(resend: Resend, db: Db, onlyIds?: string[]) {
  let q = db.from('orders').select('*')
    .in('status', ['paid', 'shipped', 'delivered'])
    .in('customer_email_status', ['sent', 'delayed', 'error', 'bounced'])
    .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(8);
  if (onlyIds?.length) q = q.in('id', onlyIds);
  const { data, error } = await q;
  if (error) return { results: [], skipped: isMissingCol(error.message) ? 'Falta aplicar supabase/migrations/20261029200000_orders_followup.sql' : error.message };
  const results: Array<{ id: string; status: string }> = [];
  for (const o of data ?? []) {
    if (!o.customer_email || !EMAIL_RE.test(o.customer_email)) continue;
    const st = String(o.customer_email_status);
    if (st === 'bounced' && o.customer_email_alerted_at) continue; // esperando que corrijas el correo
    if (st === 'error') {
      if ((Number(o.customer_email_tries) || 0) >= 6) {
        await alertNotDelivered(resend, db, o, 'No se pudo enviar el correo de confirmación después de varios intentos.');
        continue;
      }
      const r = await sendConfirmation(resend, db, o, 1);
      results.push({ id: o.id, status: r.ok ? 'sent' : 'error' });
      continue;
    }
    if (!o.customer_email_id) continue;
    await sleep(550); // límite de Resend: 2 consultas por segundo
    const { data: em, error: e } = await resend.emails.get(o.customer_email_id);
    if (e || !em) continue;
    const ev = String(em.last_event || '');
    const next = DELIVERED_EVENTS.includes(ev) ? 'delivered' : ev === 'delivery_delayed' ? 'delayed' : FAILED_EVENTS.includes(ev) ? 'bounced' : st;
    if (next === 'bounced' && st !== 'bounced' && (Number(o.customer_email_tries) || 0) < 2) {
      const r = await sendConfirmation(resend, db, o, 1); // un reintento por si fue un fallo pasajero
      results.push({ id: o.id, status: r.ok ? 'sent' : 'error' });
      continue;
    }
    await patchOrder(db, o.id, { customer_email_status: next, customer_email_checked_at: nowIso() });
    if (next === 'bounced') await alertNotDelivered(resend, db, o, `El correo de confirmación rebotó: la dirección ${o.customer_email} no lo aceptó.`);
    results.push({ id: o.id, status: next });
  }
  return { results };
}

/** Datos del pedido que puede ver el cliente (sin datos de pago ni internos). */
function publicOrder(o: any) {
  const items = (Array.isArray(o.items) ? o.items : []).map((i: any) => ({
    name: String(i?.product?.name || 'Producto'),
    slug: i?.product?.slug ?? null,
    image_url: i?.product?.image_url ?? null,
    variant: i?.variant ?? null,
    qty: Math.max(1, Number(i?.quantity) || 1),
    price: Number(i?.product?.price) || 0,
  }));
  const subtotal = Math.round(items.reduce((s: number, i: any) => s + i.price * i.qty, 0) * 100) / 100;
  const discount = Number(o.discount_amount) || 0;
  const total = Number(o.total) || 0;
  const shipping = Math.max(0, Math.round((total - (subtotal - discount)) * 100) / 100);
  const [user, domain] = String(o.customer_email || '').split('@');
  return {
    id: o.id, number: shortId(o.id), created_at: o.created_at, status: o.status || 'pending',
    first_name: String(o.customer_name || '').split(' ')[0] || null,
    email_masked: user && domain ? `${user.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}` : null,
    items, subtotal, discount, coupon_code: o.coupon_code || null, shipping, total,
    address: {
      name: o.customer_name || null, street: o.customer_address || null, neighborhood: o.customer_neighborhood || null,
      city: o.customer_city || null, state: o.customer_state || null, zip: o.customer_zip || null, reference: o.customer_reference || null,
    },
    delivery: deliveryOf(o),
    tracking_number: o.tracking_number || null,
    tracking_url: o.tracking_url && /^https?:\/\//i.test(o.tracking_url) ? o.tracking_url : null,
    shipped_at: o.shipped_at || null,
  };
}

async function cronTokenOk(db: Db, req: VercelRequest) {
  const token = String(req.headers['x-cron-token'] || '');
  if (token.length < 32) return false;
  const { data, error } = await db.rpc('sourcing_cron_token_ok', { p_token: token });
  return !error && data === true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });

  // Consulta pública del pedido: por su id (página de pago exitoso / liga del correo) o por número + correo.
  if (req.body?.type === 'order-lookup') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const db = serviceClient();
      const { orderId: id, number, email: mail } = req.body || {};
      let found: any = null;
      if (id && /^[0-9a-f-]{36}$/i.test(String(id))) {
        const { data } = await db.from('orders').select('*').eq('id', String(id)).maybeSingle();
        found = data;
      } else if (number && mail && /^[0-9a-f]{8}$/i.test(String(number).replace(/^#/, '')) && EMAIL_RE.test(String(mail).trim())) {
        const safe = String(mail).trim().replace(/[%_\\]/g, (c) => `\\${c}`);
        const { data } = await db.from('orders').select('*').ilike('customer_email', safe).order('created_at', { ascending: false }).limit(100);
        const n = String(number).replace(/^#/, '').toLowerCase();
        found = (data ?? []).find((o: any) => String(o.id).toLowerCase().startsWith(n)) ?? null;
      } else {
        return res.status(400).json({ ok: false, error: 'Escribe tu número de pedido (8 caracteres) y tu correo.' });
      }
      if (!found) return res.status(404).json({ ok: false, error: 'No encontramos un pedido con esos datos. Revisa el número y el correo con el que compraste.' });
      return res.status(200).json({ ok: true, order: publicOrder(found) });
    } catch (e: any) {
      console.error('[order-lookup]', e?.message);
      return res.status(500).json({ ok: false, error: 'No se pudo consultar el pedido. Intenta de nuevo.' });
    }
  }

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

      const notifyTo = await notifyList(db);
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
            ${btn(ADMIN_URL, 'Abrir en el admin')}`),
        });
        if (error) throw new Error(error.message);
        await db.from('orders').update({ admin_notified_at: nowIso() }).eq('id', o.id);
        sent.push('admin');
      }

      let customer: string | null = null;
      if (!o.customer_notified_at && o.customer_email && EMAIL_RE.test(o.customer_email)) {
        const r = await sendConfirmation(resend, db, o, 3);
        customer = r.ok ? 'sent' : 'error';
        if (r.ok) sent.push('cliente');
        else await alertNotDelivered(resend, db, o, `No se pudo enviar el correo de confirmación a ${o.customer_email} (${r.error}). Se reintentará solo cada 10 minutos.`);
      }
      return res.status(200).json({ ok: true, sent, customer });
    }

    // Revisa si llegaron las confirmaciones y reenvía las que fallaron (pg_cron cada 10 min, o el admin al abrir Pedidos).
    if (type === 'order-mail-check') {
      const db = serviceClient();
      if (!await cronTokenOk(db, req) && !await hasAdminSession(req)) return res.status(401).json({ ok: false, error: 'No autorizado.' });
      const ids = Array.isArray(req.body?.orderIds) ? req.body.orderIds.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 8) : undefined;
      const r = await checkConfirmations(resend, db, ids);
      return res.status(200).json({ ok: true, ...r });
    }

    // Reenviar la confirmación al cliente (admin). Opcional: corregir el correo.
    if (type === 'order-resend') {
      if (!await hasAdminSession(req)) return res.status(401).json({ ok: false, error: 'Se requiere una sesión de administrador.' });
      if (!orderId || !/^[0-9a-f-]{36}$/i.test(String(orderId))) return res.status(400).json({ ok: false, error: 'Pedido no válido.' });
      const db = serviceClient();
      const { data: o, error: oErr } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (oErr) throw new Error(oErr.message);
      if (!o) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
      if (!['paid', 'shipped', 'delivered'].includes(o.status)) return res.status(409).json({ ok: false, error: 'El pedido no está pagado.' });
      const newEmail = typeof email === 'string' ? email.trim() : '';
      if (newEmail && !EMAIL_RE.test(newEmail)) return res.status(400).json({ ok: false, error: 'Correo no válido.' });
      if (newEmail && newEmail.toLowerCase() !== String(o.customer_email || '').toLowerCase()) {
        await db.from('orders').update({ customer_email: newEmail }).eq('id', o.id);
        o.customer_email = newEmail;
      }
      if (!o.customer_email || !EMAIL_RE.test(o.customer_email)) return res.status(400).json({ ok: false, error: 'El pedido no tiene un correo válido.' });
      await patchOrder(db, o.id, { customer_email_alerted_at: null, customer_email_tries: 0 });
      o.customer_email_tries = 0;
      const r = await sendConfirmation(resend, db, o, 2);
      if (!r.ok) return res.status(502).json({ ok: false, error: `No se pudo enviar: ${r.error}` });
      return res.status(200).json({ ok: true, email: o.customer_email, status: 'sent' });
    }

    // Aviso de envío al cliente según la forma de entrega (lo dispara el admin).
    if (type === 'order-shipped') {
      if (!orderId || !/^[0-9a-f-]{36}$/i.test(String(orderId))) return res.status(400).json({ ok: false, error: 'Pedido no válido.' });
      const db = serviceClient();
      const { data: o, error: oErr } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (oErr) throw new Error(oErr.message);
      if (!o) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
      if (!o.customer_email || !EMAIL_RE.test(o.customer_email)) return res.status(400).json({ ok: false, error: 'El pedido no tiene un correo válido.' });
      let lastErr = '';
      for (let i = 0; i < 2; i += 1) {
        const { error } = await resend.emails.send({
          from: FROM,
          to: [o.customer_email],
          replyTo: TO,
          subject: `Tu pedido #${shortId(o.id)} va en camino 🚚`,
          html: shippedHtml(o),
        });
        if (!error) {
          await db.from('orders').update({ shipping_notified_at: nowIso() }).eq('id', o.id);
          return res.status(200).json({ ok: true });
        }
        lastErr = error.message;
        await sleep(900);
      }
      throw new Error(lastErr);
    }

    return res.status(400).json({ ok: false, error: 'Tipo de correo no reconocido.' });
  } catch (err: any) {
    console.error('[send-email] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'No se pudo enviar el correo.' });
  }
}
