/**
 * AdminOrderReports.tsx — Pedidos y clientes (/admin/reportes)
 * Resumen en fichas, búsqueda, filtros por estado y periodo, selección múltiple,
 * borrar, enviar pedido (paquetería con guía · entrega personal · directo del proveedor + aviso por correo), etiqueta
 * imprimible, avisos de pedido nuevo y acceso a campañas desde Clientes.
 * Pago Clip: cada cobro se confirma con la API de Clip (/api/clip-verify). Un pedido
 * solo se puede enviar cuando Clip lo reporta aprobado y el monto coincide.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, RefreshCw, Download, Settings2, Truck, Tag, Trash2, ChevronDown, ChevronRight,
  Mail, MessageCircle, Copy, Check, X, Send, Package, Users, AlertTriangle, CreditCard, ShieldCheck,
} from 'lucide-react';
import { getOrders, deleteOrders, updateOrder, getStoreConfig } from '../../lib/queries';
import { supabase, getImageUrl } from '../../lib/supabase';
import type { Order, CartItem } from '../../types';
import './AdminOrders.css';

type Status = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
type Tab = 'orders' | 'customers';
type Period = 'all' | 'today' | '7d' | '30d' | 'month';

const STATUS: Record<Status, { label: string; tone: string }> = {
  pending:   { label: 'Sin pagar',  tone: 'warn' },
  paid:      { label: 'Por enviar', tone: 'ok' },
  shipped:   { label: 'Enviado',    tone: 'info' },
  delivered: { label: 'Entregado',  tone: 'done' },
  cancelled: { label: 'Cancelado',  tone: 'bad' },
};
const PAID: Status[] = ['paid', 'shipped', 'delivered'];
const CARRIERS = ['Estafeta', 'DHL', 'FedEx', 'Paquetexpress', 'Redpack', '99 Minutos', 'Correos de México', 'Otra'];

/** Forma de entrega guardada en shipping_carrier: "Entrega personal", "Directo de: <proveedor>" o la paquetería. */
type ShipKind = 'paqueteria' | 'personal' | 'proveedor';
function shipKindOf(carrier?: string | null): { kind: ShipKind; carrier: string; supplier: string } {
  const c = String(carrier || '').trim();
  if (/^entrega (personal|local)$/i.test(c)) return { kind: 'personal', carrier: '', supplier: '' };
  const m = c.match(/^directo de:?\s*(.+)$/i);
  if (m) return { kind: 'proveedor', carrier: '', supplier: m[1].trim() };
  return { kind: 'paqueteria', carrier: c, supplier: '' };
}
const shipLabel = (carrier?: string | null) => {
  const k = shipKindOf(carrier);
  return k.kind === 'personal' ? 'Entrega personal' : k.kind === 'proveedor' ? `Directo de ${k.supplier}` : k.carrier;
};

/** Estado del correo de confirmación al cliente. */
const MAIL: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' }> = {
  delivered: { label: 'Le llegó', tone: 'ok' },
  sent: { label: 'Enviado, esperando entrega', tone: 'info' },
  delayed: { label: 'Entrega retrasada', tone: 'warn' },
  bounced: { label: 'No le llegó (rebotó)', tone: 'bad' },
  error: { label: 'No se pudo enviar · reintentando', tone: 'bad' },
};
const PERIODS: Record<Period, string> = { all: 'Todo', today: 'Hoy', '7d': '7 días', '30d': '30 días', month: 'Este mes' };

const CFG_KEYS = ['orders_notify_email', 'ship_from_name', 'ship_from_phone', 'ship_from_address', 'ship_from_city', 'ship_from_state', 'ship_from_zip'] as const;
type ShipCfg = Record<(typeof CFG_KEYS)[number], string>;
const EMPTY_CFG: ShipCfg = { orders_notify_email: 'admin@divinastore.com.mx', ship_from_name: 'Divina Store MX', ship_from_phone: '', ship_from_address: '', ship_from_city: '', ship_from_state: '', ship_from_zip: '' };

/* ── Pago Clip ── */
type ClipKey = 'approved' | 'authorized' | 'pending' | 'rejected' | 'cancelled' | 'refunded' | 'unverified' | 'none';
const CLIP: Record<ClipKey, { label: string; tone: string; hint: string }> = {
  approved:   { label: 'Aprobado',      tone: 'ok',    hint: 'Clip confirma el cobro' },
  authorized: { label: 'Autorizado',    tone: 'info',  hint: 'Autorizado, aún no capturado' },
  pending:    { label: 'En proceso',    tone: 'warn',  hint: 'Clip aún no lo aprueba (ej. 3D Secure)' },
  rejected:   { label: 'Rechazado',     tone: 'bad',   hint: 'El banco rechazó el cobro' },
  cancelled:  { label: 'Cancelado',     tone: 'bad',   hint: 'Cobro cancelado en Clip' },
  refunded:   { label: 'Reembolsado',   tone: 'bad',   hint: 'Se devolvió el dinero' },
  unverified: { label: 'Sin verificar', tone: 'muted', hint: 'Tiene cobro en Clip; falta consultarlo' },
  none:       { label: 'Sin cobro',     tone: 'muted', hint: 'No hay cobro de Clip para este pedido' },
};
const CLIP_FINAL = ['approved', 'rejected', 'cancelled', 'refunded'];
const clipPid = (o: Order): string | null => o.clip_payment_id || o.payment_info?.transaction_id || null;
const clipKey = (o: Order): ClipKey => {
  const s = (o.clip_status || '').toLowerCase() as ClipKey;
  if (s && s in CLIP && s !== 'unverified' && s !== 'none') return s;
  return clipPid(o) ? 'unverified' : 'none';
};
const clipMismatch = (o: Order) => o.clip_amount != null && Math.abs(Number(o.clip_amount) - Number(o.total || 0)) > 0.01;
const clipOk = (o: Order) => clipKey(o) === 'approved' && !clipMismatch(o);
const clipNo = (o: Order) => o.clip_auth_code ? `Aut. ${o.clip_auth_code}` : o.clip_receipt_no ? `Rec. ${o.clip_receipt_no}` : '';

const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const money = (n: number) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' + new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
const itemsOf = (o: Order): CartItem[] => (Array.isArray(o.items) ? o.items : []);
const unitsOf = (o: Order) => itemsOf(o).reduce((s, i) => s + (i.quantity || 0), 0);
const phoneDigits = (p?: string) => (p || '').replace(/\D/g, '');
const waLink = (p?: string, text = '') => {
  const d = phoneDigits(p);
  if (d.length < 10) return null;
  const full = d.length === 10 ? `52${d}` : d;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function inPeriod(iso: string | undefined, p: Period) {
  if (p === 'all') return true;
  if (!iso) return false;
  const d = new Date(iso); const now = new Date();
  if (p === 'today') return d.toDateString() === now.toDateString();
  if (p === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  const days = p === '7d' ? 7 : 30;
  return now.getTime() - d.getTime() <= days * 86_400_000;
}

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

interface Customer {
  email: string; name: string; phone: string; city: string; state: string;
  orders: number; spent: number; last: string; marketing: boolean;
}

/** Etiqueta 4×6" imprimible en una ventana nueva. */
function printLabel(o: Order, cfg: ShipCfg) {
  const w = window.open('', '_blank', 'width=520,height=760');
  if (!w) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio.'); return; }
  const from = [cfg.ship_from_address, [cfg.ship_from_city, cfg.ship_from_state].filter(Boolean).join(', '), cfg.ship_from_zip ? `CP ${cfg.ship_from_zip}` : ''].filter(Boolean);
  const to = [o.customer_address, o.customer_neighborhood, [o.customer_city, o.customer_state].filter(Boolean).join(', '), o.customer_zip ? `CP ${o.customer_zip}` : ''].filter(Boolean);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta #${shortId(o.id)}</title>
<style>
  @page { size: 4in 6in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #e9e9e9; }
  .label { width: 4in; height: 6in; margin: 12px auto; background: #fff; padding: 0.22in; display: flex; flex-direction: column; gap: 0.12in; border: 1px solid #bbb; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #000; padding-bottom: 6px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 4px; }
  .num { font-size: 11px; text-align: right; } .num b { display: block; font-size: 20px; letter-spacing: 1px; }
  .k { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #444; margin-bottom: 3px; }
  .from { font-size: 11px; line-height: 1.35; }
  .to { border: 2px solid #000; border-radius: 6px; padding: 0.12in; flex: 1; }
  .to .name { font-size: 20px; font-weight: 800; line-height: 1.15; margin-bottom: 6px; }
  .to .addr { font-size: 15px; line-height: 1.35; }
  .to .ref { font-size: 12px; margin-top: 6px; } .to .tel { font-size: 15px; font-weight: 700; margin-top: 8px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; border-top: 1px dashed #000; padding-top: 6px; }
  .actions { width: 4in; margin: 0 auto 16px; display: flex; gap: 8px; }
  .actions button { flex: 1; padding: 10px; font-size: 14px; font-weight: 700; border-radius: 8px; border: 0; cursor: pointer; background: #12261f; color: #fff; }
  @media print { body { background: #fff; } .label { margin: 0; border: 0; } .actions { display: none; } }
</style></head><body>
<div class="label">
  <div class="top"><div class="brand">DIVINA</div><div class="num">Pedido<b>#${shortId(o.id)}</b></div></div>
  <div class="from"><div class="k">Remitente</div><strong>${esc(cfg.ship_from_name || 'Divina Store MX')}</strong>${cfg.ship_from_phone ? ' · ' + esc(cfg.ship_from_phone) : ''}<br>${from.map(esc).join('<br>') || '<em>Configura tu dirección de envío en Pedidos → Ajustes</em>'}</div>
  <div class="to"><div class="k">Destinatario</div>
    <div class="name">${esc(o.customer_name || '—')}</div>
    <div class="addr">${to.map(esc).join('<br>')}</div>
    ${o.customer_reference ? `<div class="ref"><strong>Referencia:</strong> ${esc(o.customer_reference)}</div>` : ''}
    ${o.customer_phone ? `<div class="tel">Tel. ${esc(o.customer_phone)}</div>` : ''}
  </div>
  <div class="meta"><span>${unitsOf(o)} pieza(s)</span><span>${o.shipping_carrier ? esc(o.shipping_carrier) : ''}${o.tracking_number ? ' · ' + esc(o.tracking_number) : ''}</span><span>${new Date(o.created_at || Date.now()).toLocaleDateString('es-MX')}</span></div>
</div>
<div class="actions"><button onclick="window.print()">Imprimir</button><button onclick="window.close()" style="background:#777">Cerrar</button></div>
</body></html>`);
  w.document.close();
}

/* ───────────────────────────────────────────────────────────────── */

export const AdminOrderReports: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const clipOpen = params.get('pagos') === 'clip';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('orders');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [custSel, setCustSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<string | null>(null); // id o 'bulk'
  const [busy, setBusy] = useState<string | null>(null);
  const [shipFor, setShipFor] = useState<Order | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState<ShipCfg>(EMPTY_CFG);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string[] | 'all' | null>(null);
  const [override, setOverride] = useState<Set<string>>(new Set());
  const toastTimer = useRef<number | undefined>(undefined);
  const autoChecked = useRef(false);

  const notify = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setOrders(await getOrders());
    setLoading(false);
  }, []);

  /** Pregunta a Resend si llegaron las confirmaciones (y reenvía las que fallaron). Silencioso. */
  const mailChecked = useRef(false);
  const checkMails = useCallback(async (ids?: string[]) => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token || ''}` },
        body: JSON.stringify({ type: 'order-mail-check', ...(ids ? { orderIds: ids } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      const results: Array<{ id: string; status: Order['customer_email_status'] }> = Array.isArray(d.results) ? d.results : [];
      if (results.length) {
        const by = new Map(results.map((x) => [x.id, x.status]));
        setOrders(prev => prev.map(o => (by.has(o.id) ? { ...o, customer_email_status: by.get(o.id) ?? o.customer_email_status } : o)));
      }
    } catch { /* sin conexión: se revisa en la siguiente vuelta del cron */ }
  }, []);

  useEffect(() => {
    void load();
    getStoreConfig().then(c => setCfg(prev => {
      const next = { ...prev };
      CFG_KEYS.forEach(k => { if (c[k] !== undefined && c[k] !== '') next[k] = c[k]; });
      return next;
    }));
  }, [load]);

  const setClipOpen = useCallback((on: boolean) => {
    setParams(prev => { const n = new URLSearchParams(prev); if (on) n.set('pagos', 'clip'); else n.delete('pagos'); return n; }, { replace: true });
  }, [setParams]);

  /** Consulta a Clip (servidor) y actualiza los pedidos. Sin ids: revisa los cobros sin confirmar. */
  const verifyClip = useCallback(async (ids?: string[], silent = false) => {
    setVerifying(ids ?? 'all');
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch('/api/clip-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token || ''}` },
        body: JSON.stringify(ids ? { orderIds: ids } : {}),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { if (!silent) notify('err', d.error || `No se pudo consultar Clip (${r.status}).`); return; }
      const results: any[] = Array.isArray(d.results) ? d.results : [];
      const byId = new Map(results.filter(x => x.result === 'ok').map(x => [x.id, x]));
      if (byId.size) {
        setOrders(prev => prev.map(o => {
          const x = byId.get(o.id);
          if (!x) return o;
          return {
            ...o, status: x.status ?? o.status,
            clip_payment_id: x.clip_payment_id, clip_status: x.clip_status, clip_status_code: x.clip_status_code,
            clip_receipt_no: x.clip_receipt_no, clip_auth_code: x.clip_auth_code, clip_card: x.clip_card,
            clip_amount: x.clip_amount, clip_approved_at: x.clip_approved_at, clip_verified_at: x.clip_verified_at,
          };
        }));
      }
      // Pedidos que Clip aprobó y seguían "Sin pagar": mandar los avisos (el servidor evita duplicados)
      results.filter(x => x.promoted).forEach(x => {
        void fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'order-paid', orderId: x.id }) }).catch(() => {});
      });
      if (silent) return;
      const errs = results.filter(x => x.result === 'error');
      const none = results.filter(x => x.result === 'no_payment').length;
      if (!results.length) return notify('ok', 'Todo al día: no hay cobros pendientes de confirmar.');
      if (errs.length) return notify('err', `Clip: ${byId.size} consultado${byId.size === 1 ? '' : 's'}, ${errs.length} con error — ${errs[0].error}`);
      notify('ok', `Clip: ${byId.size} cobro${byId.size === 1 ? '' : 's'} consultado${byId.size === 1 ? '' : 's'}${none ? ` · ${none} sin cobro` : ''}.`);
    } catch {
      if (!silent) notify('err', 'No se pudo conectar con el servidor.');
    } finally {
      setVerifying(null);
    }
  }, [notify]);

  useEffect(() => {
    if (loading || mailChecked.current) return;
    mailChecked.current = true;
    if (orders.some(o => o.customer_email_status && o.customer_email_status !== 'delivered')) void checkMails();
  }, [loading, orders, checkMails]);

  // Al abrir: confirmar en segundo plano los cobros que aún no tienen estado final
  useEffect(() => {
    if (loading || autoChecked.current) return;
    autoChecked.current = true;
    if (orders.some(o => clipPid(o) && !CLIP_FINAL.includes((o.clip_status || '').toLowerCase()))) void verifyClip(undefined, true);
  }, [loading, orders, verifyClip]);

  const isVerifying = (id: string) => verifying === 'all' || (Array.isArray(verifying) && verifying.includes(id));
  const canShip = (o: Order) => PAID.includes((o.status || 'pending') as Status) && (clipOk(o) || override.has(o.id));

  /* ── Datos derivados ── */
  const inRange = useMemo(() => orders.filter(o => inPeriod(o.created_at, period)), [orders, period]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return inRange.filter(o => {
      if (status !== 'all' && (o.status || 'pending') !== status) return false;
      if (!t) return true;
      return [o.customer_name, o.customer_email, o.customer_phone, o.id, o.tracking_number, o.customer_city, o.clip_receipt_no, o.clip_auth_code, clipPid(o)]
        .some(v => (v || '').toLowerCase().includes(t))
        || itemsOf(o).some(i => (i.product?.name || '').toLowerCase().includes(t));
    });
  }, [inRange, status, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: inRange.length };
    (Object.keys(STATUS) as Status[]).forEach(k => { c[k] = inRange.filter(o => (o.status || 'pending') === k).length; });
    return c;
  }, [inRange]);

  const kpi = useMemo(() => {
    const paid = inRange.filter(o => PAID.includes((o.status || 'pending') as Status));
    const sales = paid.reduce((s, o) => s + (o.total || 0), 0);
    return {
      sales, paidCount: paid.length,
      avg: paid.length ? sales / paid.length : 0,
      toShip: inRange.filter(o => o.status === 'paid').length,
      unpaid: inRange.filter(o => (o.status || 'pending') === 'pending').length,
      clipSum: inRange.filter(o => clipKey(o) === 'approved').reduce((s, o) => s + Number(o.clip_amount ?? o.total ?? 0), 0),
      clipCount: inRange.filter(o => clipKey(o) === 'approved').length,
      toConfirm: inRange.filter(o => PAID.includes((o.status || 'pending') as Status) && !clipOk(o)).length,
    };
  }, [inRange]);

  const customers = useMemo<Customer[]>(() => {
    const map = new Map<string, Customer>();
    orders.forEach(o => {
      const email = (o.customer_email || '').toLowerCase().trim();
      if (!email) return;
      const counted = PAID.includes((o.status || 'pending') as Status);
      const c = map.get(email) ?? { email, name: '', phone: '', city: '', state: '', orders: 0, spent: 0, last: '', marketing: false };
      if (counted) { c.orders++; c.spent += o.total || 0; }
      if (!c.last || (o.created_at || '') > c.last) {
        c.last = o.created_at || c.last; c.name = o.customer_name || c.name; c.phone = o.customer_phone || c.phone;
        c.city = o.customer_city || c.city; c.state = o.customer_state || c.state;
      }
      if (o.accepts_marketing) c.marketing = true;
      map.set(email, c);
    });
    return [...map.values()].sort((a, b) => b.spent - a.spent || b.last.localeCompare(a.last));
  }, [orders]);

  // La búsqueda filtra la tabla, no el total de clientes del resumen
  const shownCustomers = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? customers.filter(c => [c.email, c.name, c.phone, c.city].some(v => v.toLowerCase().includes(t))) : customers;
  }, [customers, q]);

  /* ── Acciones ── */
  const changeStatus = async (o: Order, s: Status) => {
    setBusy(o.id);
    const err = await updateOrder(o.id, { status: s });
    setBusy(null);
    if (err) return notify('err', `No se pudo cambiar el estado: ${err}`);
    setOrders(prev => prev.map(x => x.id === o.id ? { ...x, status: s } : x));
  };

  const doDelete = async (ids: string[]) => {
    setBusy('delete');
    const n = await deleteOrders(ids);
    setBusy(null); setConfirmDel(null);
    if (n === null) return notify('err', 'No se pudieron borrar. Revisa que la migración de pedidos v2 esté aplicada.');
    if (n < ids.length) notify('err', `Se borraron ${n} de ${ids.length}. Revisa los permisos de la tabla orders.`);
    else notify('ok', n === 1 ? 'Pedido borrado.' : `${n} pedidos borrados.`);
    setOrders(prev => prev.filter(o => !ids.includes(o.id)));
    setSel(new Set()); if (open && ids.includes(open)) setOpen(null);
  };

  const resendPaidNotice = async (o: Order) => {
    setBusy(o.id);
    await updateOrder(o.id, { admin_notified_at: null } as Partial<Order>);
    const r = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'order-paid', orderId: o.id }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return notify('err', d.error || 'No se pudo enviar el aviso.');
    notify('ok', 'Aviso de pedido reenviado a tu correo.');
    void load();
  };

  /** Reenvía la confirmación al cliente; con `email` corrige primero su correo. */
  const resendConfirmation = async (o: Order, email?: string) => {
    setBusy(o.id);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token || ''}` },
        body: JSON.stringify({ type: 'order-resend', orderId: o.id, ...(email ? { email } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return notify('err', d.error || 'No se pudo reenviar.');
      setOrders(prev => prev.map(x => x.id === o.id ? { ...x, customer_email: d.email ?? x.customer_email, customer_email_status: 'sent', customer_notified_at: new Date().toISOString() } : x));
      notify('ok', `Confirmación reenviada a ${d.email}. Se revisa si llegó en unos minutos.`);
    } catch {
      notify('err', 'No se pudo conectar con el servidor.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1500); } catch { notify('err', 'No se pudo copiar.'); }
  };

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };
  const allVisibleSelected = filtered.length > 0 && filtered.every(o => sel.has(o.id));

  const goCampaign = (emails: string[]) => navigate(`/admin/newsletter?para=${encodeURIComponent(emails.join(','))}`);

  const exportOrders = () => downloadCSV(`divina_pedidos_${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Pedido', 'Fecha', 'Estado', 'Cliente', 'Email', 'Teléfono', 'Dirección', 'Colonia', 'Ciudad', 'Estado (lugar)', 'CP', 'Referencia', 'Productos', 'Piezas', 'Total', 'Pago Clip', 'Recibo Clip', 'Autorización Clip', 'Tarjeta', 'Paquetería', 'Guía'],
    ...filtered.map(o => [shortId(o.id), fmtDate(o.created_at), STATUS[(o.status || 'pending') as Status]?.label || o.status || '', o.customer_name || '', o.customer_email || '', o.customer_phone || '',
      o.customer_address || '', o.customer_neighborhood || '', o.customer_city || '', o.customer_state || '', o.customer_zip || '', o.customer_reference || '',
      itemsOf(o).map(i => `${i.quantity}x ${i.product?.name}`).join(' | '), String(unitsOf(o)), money(o.total), clipMismatch(o) ? 'Monto distinto' : CLIP[clipKey(o)].label, o.clip_receipt_no || '', o.clip_auth_code || '', o.clip_card || '', o.shipping_carrier || '', o.tracking_number || '']),
  ]);
  const exportCustomers = () => downloadCSV(`divina_clientes_${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Email', 'Nombre', 'Teléfono', 'Ciudad', 'Estado', 'Compras pagadas', 'Total', 'Último pedido', 'Acepta marketing'],
    ...customers.map(c => [c.email, c.name, c.phone, c.city, c.state, String(c.orders), money(c.spent), fmtDate(c.last), c.marketing ? 'Sí' : 'No']),
  ]);

  /* ── Render ── */
  return (
    <div className="ord">
      {/* Encabezado */}
      <header className="ord-head">
        <div>
          <h1 className="ord-title">Pedidos</h1>
          <p className="ord-sub">Avisos de pedidos nuevos a <strong>{cfg.orders_notify_email || 'sin configurar'}</strong></p>
        </div>
        <div className="ord-head__actions">
          <button type="button" className="ord-btn" onClick={() => void load()} disabled={loading} title="Volver a cargar">
            <RefreshCw size={14} className={loading ? 'ord-spin' : ''} aria-hidden="true" /> Actualizar
          </button>
          <button type="button" className={`ord-btn ${clipOpen ? 'is-on' : ''}`} onClick={() => setClipOpen(true)} title="Cobros confirmados con Clip">
            <CreditCard size={14} aria-hidden="true" /> Pagos Clip
          </button>
          <button type="button" className="ord-btn" onClick={tab === 'orders' ? exportOrders : exportCustomers}>
            <Download size={14} aria-hidden="true" /> CSV
          </button>
          <button type="button" className={`ord-btn ${showCfg ? 'is-on' : ''}`} onClick={() => setShowCfg(v => !v)} aria-expanded={showCfg}>
            <Settings2 size={14} aria-hidden="true" /> Ajustes
          </button>
        </div>
      </header>

      {showCfg && <ConfigPanel cfg={cfg} onSaved={(c) => { setCfg(c); setShowCfg(false); notify('ok', 'Ajustes guardados.'); }} onError={(m) => notify('err', m)} />}

      {/* Resumen en fichas */}
      <div className="ord-kpis" role="list">
        <Kpi label="Ventas" value={money(kpi.sales)} hint={`${kpi.paidCount} pagados`} />
        <Kpi label="Cobrado en Clip" value={money(kpi.clipSum)} hint={`${kpi.clipCount} confirmados`} onClick={() => setClipOpen(true)} />
        <Kpi label="Por confirmar" value={String(kpi.toConfirm)} tone={kpi.toConfirm ? 'warn' : undefined} hint="pagados sin OK de Clip" onClick={() => setClipOpen(true)} />
        <Kpi label="Ticket prom." value={money(kpi.avg)} />
        <Kpi label="Por enviar" value={String(kpi.toShip)} tone={kpi.toShip ? 'ok' : undefined} onClick={() => { setTab('orders'); setStatus('paid'); }} />
        <Kpi label="Sin pagar" value={String(kpi.unpaid)} tone={kpi.unpaid ? 'warn' : undefined} onClick={() => { setTab('orders'); setStatus('pending'); }} />
        <Kpi label="Clientes" value={String(customers.length)} onClick={() => setTab('customers')} />
        <label className="ord-period">
          <span className="ord-visually-hidden">Periodo</span>
          <select value={period} onChange={e => setPeriod(e.target.value as Period)} aria-label="Periodo">
            {(Object.keys(PERIODS) as Period[]).map(p => <option key={p} value={p}>{PERIODS[p]}</option>)}
          </select>
        </label>
      </div>

      {/* Pestañas + buscador */}
      <div className="ord-bar">
        <div className="ord-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'is-on' : ''} onClick={() => setTab('orders')}>
            <Package size={13} aria-hidden="true" /> Pedidos <em>{inRange.length}</em>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'customers'} className={tab === 'customers' ? 'is-on' : ''} onClick={() => setTab('customers')}>
            <Users size={13} aria-hidden="true" /> Clientes <em>{customers.length}</em>
          </button>
        </div>
        <label className="ord-search">
          <Search size={14} aria-hidden="true" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={tab === 'orders' ? 'Buscar cliente, correo, # pedido, guía o producto' : 'Buscar cliente, correo o ciudad'} aria-label="Buscar" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda"><X size={13} /></button>}
        </label>
      </div>

      {tab === 'orders' && (
        <>
          <div className="ord-chips" role="group" aria-label="Filtrar por estado">
            {(['all', ...Object.keys(STATUS)] as (Status | 'all')[]).map(s => (
              <button key={s} type="button" className={`ord-chip ${status === s ? 'is-on' : ''} ${s !== 'all' ? `t-${STATUS[s as Status].tone}` : ''}`} onClick={() => setStatus(s)} aria-pressed={status === s}>
                {s === 'all' ? 'Todos' : STATUS[s as Status].label} <em>{counts[s] ?? 0}</em>
              </button>
            ))}
          </div>

          {sel.size > 0 && (
            <div className="ord-bulk" role="region" aria-label="Acciones de selección">
              <span><strong>{sel.size}</strong> seleccionado{sel.size === 1 ? '' : 's'}</span>
              <button type="button" className="ord-link" onClick={() => setSel(new Set())}>Quitar selección</button>
              <div className="ord-bulk__right">
                {confirmDel === 'bulk' ? (
                  <span className="ord-confirm">
                    <AlertTriangle size={14} aria-hidden="true" /> ¿Borrar {sel.size} pedido{sel.size === 1 ? '' : 's'} para siempre?
                    <button type="button" className="ord-btn ord-btn--danger" disabled={busy === 'delete'} onClick={() => void doDelete([...sel])}>{busy === 'delete' ? 'Borrando…' : 'Sí, borrar'}</button>
                    <button type="button" className="ord-btn" onClick={() => setConfirmDel(null)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="ord-btn ord-btn--danger" onClick={() => setConfirmDel('bulk')}><Trash2 size={14} aria-hidden="true" /> Borrar seleccionados</button>
                )}
              </div>
            </div>
          )}

          {loading ? <div className="ord-empty">Cargando pedidos…</div> : filtered.length === 0 ? (
            <div className="ord-empty">{orders.length === 0 ? 'Aún no hay pedidos.' : 'Ningún pedido coincide con estos filtros.'}</div>
          ) : (
            <div className="ord-table-wrap">
              <table className="ord-table">
                <thead>
                  <tr>
                    <th className="c-check"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSel(allVisibleSelected ? new Set() : new Set(filtered.map(o => o.id)))} aria-label="Seleccionar todos" /></th>
                    <th>Pedido</th><th>Cliente</th><th className="c-num c-hide-sm">Pzs</th><th className="c-num">Total</th><th>Pago Clip</th><th>Estado</th><th className="c-hide-sm">Envío</th><th className="c-act">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const st = (o.status || 'pending') as Status;
                    const isOpen = open === o.id;
                    return (
                      <React.Fragment key={o.id}>
                        <tr className={`${isOpen ? 'is-open' : ''} ${sel.has(o.id) ? 'is-sel' : ''}`}>
                          <td className="c-check"><input type="checkbox" checked={sel.has(o.id)} onChange={() => setSel(s => toggle(s, o.id))} aria-label={`Seleccionar pedido ${shortId(o.id)}`} /></td>
                          <td>
                            <button type="button" className="ord-rowbtn" onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen}>
                              {isOpen ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                              <span className="ord-id">#{shortId(o.id)}</span>
                            </button>
                            <span className="ord-date">{fmtDate(o.created_at)}</span>
                          </td>
                          <td className="c-client"><strong>{o.customer_name || '—'}</strong><span>{o.customer_email || ''}</span></td>
                          <td className="c-num c-hide-sm">{unitsOf(o)}</td>
                          <td className="c-num ord-money">{money(o.total)}</td>
                          <td><ClipCell order={o} busy={isVerifying(o.id)} onVerify={() => void verifyClip([o.id])} /></td>
                          <td>
                            <select className={`ord-status t-${STATUS[st]?.tone}`} value={st} disabled={busy === o.id} onChange={e => void changeStatus(o, e.target.value as Status)} aria-label="Estado del pedido">
                              {(Object.keys(STATUS) as Status[]).map(k => (
                                <option key={k} value={k} disabled={(k === 'shipped' || k === 'delivered') && k !== st && !canShip(o)}>
                                  {STATUS[k].label}{(k === 'shipped' || k === 'delivered') && k !== st && !canShip(o) ? ' (falta Clip)' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="c-ship c-hide-sm">{o.shipping_carrier || o.tracking_number ? <><strong>{shipLabel(o.shipping_carrier) || 'Guía'}</strong>{o.tracking_number && <span>{o.tracking_number}</span>}</> : <span className="ord-muted">—</span>}</td>
                          <td className="c-act">
                            {confirmDel === o.id ? (
                              <span className="ord-confirm ord-confirm--row">
                                ¿Borrar?
                                <button type="button" className="ord-icon ord-icon--danger" disabled={busy === 'delete'} onClick={() => void doDelete([o.id])} aria-label="Confirmar borrar"><Check size={14} /></button>
                                <button type="button" className="ord-icon" onClick={() => setConfirmDel(null)} aria-label="Cancelar"><X size={14} /></button>
                              </span>
                            ) : (
                              <>
                                {PAID.includes(st) && (
                                  <button type="button" className={`ord-btn ord-btn--sm ${st === 'paid' ? 'ord-btn--primary' : ''}`} onClick={() => setShipFor(o)} disabled={!canShip(o)}
                                    title={!canShip(o) ? 'Primero confirma el cobro con Clip (columna Pago Clip)' : st === 'paid' ? 'Paquetería, entrega personal o directo del proveedor' : 'Editar forma de entrega o guía'}>
                                    <Truck size={13} aria-hidden="true" /> {st === 'paid' ? 'Enviar pedido' : 'Envío'}
                                  </button>
                                )}
                                <button type="button" className="ord-icon" onClick={() => printLabel(o, cfg)} title="Crear etiqueta" aria-label="Crear etiqueta"><Tag size={15} /></button>
                                <button type="button" className="ord-icon ord-icon--danger" onClick={() => setConfirmDel(o.id)} title="Borrar pedido" aria-label="Borrar pedido"><Trash2 size={15} /></button>
                              </>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="ord-detail"><td colSpan={9}>
                            <div className="ord-detail__grid">
                              <section>
                                <h4>Productos</h4>
                                <ul className="ord-items">
                                  {itemsOf(o).length ? itemsOf(o).map((i, k) => (
                                    <li key={k}>
                                      {i.product?.image_url ? <img src={getImageUrl(i.product.image_url, { width: 80, quality: 70 })} alt="" /> : <span className="ord-thumb" />}
                                      <span className="ord-items__name">{i.quantity}× {i.product?.name || 'Producto'}</span>
                                      <span className="ord-money">{money((i.product?.price || 0) * (i.quantity || 0))}</span>
                                    </li>
                                  )) : <li className="ord-muted">Sin detalle de productos</li>}
                                </ul>
                                <p className="ord-total">Total <strong>{money(o.total)} MXN</strong></p>
                                {o.promoter_code && <p className="ord-muted">Promotora: {o.promoter_code}</p>}
                                <ClipDetail
                                  order={o}
                                  busy={isVerifying(o.id)}
                                  overridden={override.has(o.id)}
                                  onVerify={() => void verifyClip([o.id])}
                                  onOverride={() => setOverride(s => new Set(s).add(o.id))}
                                />
                              </section>
                              <section>
                                <h4>Enviar a</h4>
                                <p className="ord-addr">
                                  <strong>{o.customer_name || '—'}</strong><br />
                                  {[o.customer_address, o.customer_neighborhood, [o.customer_city, o.customer_state].filter(Boolean).join(', '), o.customer_zip && `CP ${o.customer_zip}`].filter(Boolean).join(' · ')}
                                  {o.customer_reference && <><br /><em>Ref: {o.customer_reference}</em></>}
                                </p>
                                <div className="ord-inline">
                                  <button type="button" className="ord-btn" onClick={() => void copy(`a-${o.id}`, [o.customer_name, o.customer_address, o.customer_neighborhood, o.customer_city, o.customer_state, o.customer_zip && `CP ${o.customer_zip}`, o.customer_phone && `Tel ${o.customer_phone}`].filter(Boolean).join(', '))}>
                                    {copied === `a-${o.id}` ? <Check size={13} /> : <Copy size={13} />} Copiar dirección
                                  </button>
                                  <button type="button" className="ord-btn" onClick={() => printLabel(o, cfg)}><Tag size={13} /> Etiqueta</button>
                                </div>
                              </section>
                              <section>
                                <h4>Contacto y avisos</h4>
                                <div className="ord-inline">
                                  {o.customer_email && <a className="ord-btn" href={`mailto:${o.customer_email}?subject=${encodeURIComponent(`Tu pedido #${shortId(o.id)} en Divina Store`)}`}><Mail size={13} /> Correo</a>}
                                  {waLink(o.customer_phone, `Hola ${o.customer_name?.split(' ')[0] || ''}, te escribimos de Divina Store por tu pedido #${shortId(o.id)}.`) && (
                                    <a className="ord-btn" href={waLink(o.customer_phone, `Hola ${o.customer_name?.split(' ')[0] || ''}, te escribimos de Divina Store por tu pedido #${shortId(o.id)}.`)!} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a>
                                  )}
                                </div>
                                <ul className="ord-log">
                                  <li className={o.admin_notified_at ? 'is-ok' : ''}>Aviso a ti: {o.admin_notified_at ? fmtDate(o.admin_notified_at) : 'no enviado'}</li>
                                  <li className={o.customer_email_status === 'delivered' || (!o.customer_email_status && o.customer_notified_at) ? 'is-ok' : ''}>
                                    Confirmación al cliente: {o.customer_notified_at ? fmtDate(o.customer_notified_at) : 'no enviada'}
                                    {o.customer_email_status && <> · <span className={`ord-tag t-${MAIL[o.customer_email_status]?.tone ?? 'info'}`}>{MAIL[o.customer_email_status]?.label ?? o.customer_email_status}</span></>}
                                  </li>
                                  <li className={o.shipping_notified_at ? 'is-ok' : ''}>Aviso de envío: {o.shipping_notified_at ? fmtDate(o.shipping_notified_at) : 'no enviado'}</li>
                                </ul>
                                {PAID.includes(st) && (
                                  <>
                                    <MailFix order={o} busy={busy === o.id} onResend={(email) => void resendConfirmation(o, email)} />
                                    <button type="button" className="ord-link" disabled={busy === o.id} onClick={() => void resendPaidNotice(o)}>Reenviarme el aviso de este pedido</button>
                                  </>
                                )}
                                <NoteField order={o} onSaved={(note) => setOrders(prev => prev.map(x => x.id === o.id ? { ...x, internal_note: note } : x))} onError={(m) => notify('err', m)} />
                              </section>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="ord-foot">{filtered.length} de {orders.length} pedidos</p>
            </div>
          )}
        </>
      )}

      {tab === 'customers' && (
        <>
          <div className="ord-bulk ord-bulk--soft">
            <span>{custSel.size ? <><strong>{custSel.size}</strong> seleccionado{custSel.size === 1 ? '' : 's'}</> : 'Selecciona clientes para enviarles una campaña'}</span>
            <div className="ord-bulk__right">
              <button type="button" className="ord-btn" onClick={() => setCustSel(new Set(shownCustomers.filter(c => c.marketing).map(c => c.email)))}>Seleccionar los que aceptan correos</button>
              <button type="button" className="ord-btn ord-btn--primary" disabled={!custSel.size} onClick={() => goCampaign([...custSel])}><Send size={13} aria-hidden="true" /> Enviar campaña ({custSel.size})</button>
            </div>
          </div>
          {shownCustomers.length === 0 ? <div className="ord-empty">Sin clientes todavía.</div> : (
            <div className="ord-table-wrap">
              <table className="ord-table">
                <thead>
                  <tr>
                    <th className="c-check"><input type="checkbox" checked={shownCustomers.length > 0 && shownCustomers.every(c => custSel.has(c.email))} onChange={() => setCustSel(shownCustomers.every(c => custSel.has(c.email)) ? new Set() : new Set(shownCustomers.map(c => c.email)))} aria-label="Seleccionar todos los clientes" /></th>
                    <th>Cliente</th><th className="c-hide-sm">Ubicación</th><th className="c-num c-hide-sm">Compras</th><th className="c-num">Total</th><th className="c-hide-sm">Último</th><th className="c-hide-sm">Correos</th><th className="c-act">Contactar</th>
                  </tr>
                </thead>
                <tbody>
                  {shownCustomers.map(c => (
                    <tr key={c.email} className={custSel.has(c.email) ? 'is-sel' : ''}>
                      <td className="c-check"><input type="checkbox" checked={custSel.has(c.email)} onChange={() => setCustSel(s => toggle(s, c.email))} aria-label={`Seleccionar ${c.email}`} /></td>
                      <td className="c-client"><strong>{c.name || '—'}</strong><span>{c.email}</span></td>
                      <td className="ord-muted c-hide-sm">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="c-num c-hide-sm">{c.orders}</td>
                      <td className="c-num ord-money">{money(c.spent)}</td>
                      <td className="ord-muted c-hide-sm">{fmtDate(c.last)}</td>
                      <td className="c-hide-sm"><span className={`ord-tag ${c.marketing ? 't-ok' : ''}`}>{c.marketing ? 'Acepta' : 'No'}</span></td>
                      <td className="c-act">
                        <button type="button" className="ord-icon ord-icon--primary" onClick={() => goCampaign([c.email])} title="Enviar email (Newsletter y campañas)" aria-label={`Enviar email a ${c.email}`}><Mail size={15} /></button>
                        {waLink(c.phone) ? <a className="ord-icon" href={waLink(c.phone, `Hola ${c.name.split(' ')[0] || ''}, te escribimos de Divina Store.`)!} target="_blank" rel="noreferrer" title="WhatsApp" aria-label={`WhatsApp a ${c.name || c.email}`}><MessageCircle size={15} /></a> : <span className="ord-icon is-ghost" aria-hidden="true" />}
                        <button type="button" className="ord-icon" onClick={() => void copy(`e-${c.email}`, c.email)} title="Copiar correo" aria-label={`Copiar ${c.email}`}>{copied === `e-${c.email}` ? <Check size={15} /> : <Copy size={15} />}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="ord-foot">Compras y total cuentan solo pedidos pagados.</p>
            </div>
          )}
        </>
      )}

      {shipFor && (
        <ShipModal
          order={shipFor}
          onClose={() => setShipFor(null)}
          onDone={(patch, msg) => { setOrders(prev => prev.map(x => x.id === shipFor.id ? { ...x, ...patch } : x)); setShipFor(null); notify(msg.kind, msg.text); }}
          onLabel={(o) => printLabel(o, cfg)}
        />
      )}

      {clipOpen && (
        <ClipModal
          orders={orders}
          verifying={verifying}
          onVerify={(ids) => void verifyClip(ids)}
          onClose={() => setClipOpen(false)}
          onGo={(id) => { setClipOpen(false); setTab('orders'); setStatus('all'); setPeriod('all'); setQ(shortId(id).toLowerCase()); setOpen(id); }}
        />
      )}

      {toast && <div className={`ord-toast is-${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
};

/* ── Ficha de resumen ── */
const Kpi: React.FC<{ label: string; value: string; hint?: string; tone?: string; onClick?: () => void }> = ({ label, value, hint, tone, onClick }) => {
  const inner = <><span className="ord-kpi__label">{label}</span><strong className="ord-kpi__value">{value}</strong>{hint && <span className="ord-kpi__hint">{hint}</span>}</>;
  return onClick
    ? <button type="button" role="listitem" className={`ord-kpi is-click ${tone ? `t-${tone}` : ''}`} onClick={onClick}>{inner}</button>
    : <div role="listitem" className={`ord-kpi ${tone ? `t-${tone}` : ''}`}>{inner}</div>;
};

/* ── Reenviar confirmación al cliente (con corrección de correo) ── */
const MailFix: React.FC<{ order: Order; busy: boolean; onResend: (email?: string) => void }> = ({ order, busy, onResend }) => {
  const failed = order.customer_email_status === 'bounced' || order.customer_email_status === 'error' || !order.customer_notified_at;
  const [editing, setEditing] = useState(failed && order.customer_email_status === 'bounced');
  const [v, setV] = useState(order.customer_email || '');
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  if (!editing) {
    return (
      <div className="ord-inline" style={{ marginBottom: 6 }}>
        <button type="button" className={`ord-btn ord-btn--sm ${failed ? 'ord-btn--primary' : ''}`} disabled={busy || !order.customer_email} onClick={() => onResend()}>
          <Send size={12} aria-hidden="true" /> {busy ? 'Enviando…' : 'Reenviar confirmación'}
        </button>
        <button type="button" className="ord-link" onClick={() => setEditing(true)}>Corregir correo</button>
      </div>
    );
  }
  return (
    <form className="ord-inline ord-mailfix" style={{ marginBottom: 6 }} onSubmit={(e) => { e.preventDefault(); if (ok) onResend(v.trim()); }}>
      <input type="email" value={v} onChange={(e) => setV(e.target.value)} aria-label="Correo del cliente" aria-invalid={!ok} placeholder="correo@cliente.com" />
      <button type="submit" className="ord-btn ord-btn--sm ord-btn--primary" disabled={busy || !ok}><Send size={12} aria-hidden="true" /> {busy ? 'Enviando…' : 'Guardar y reenviar'}</button>
      <button type="button" className="ord-link" onClick={() => setEditing(false)}>Cancelar</button>
    </form>
  );
};

/* ── Nota interna ── */
const NoteField: React.FC<{ order: Order; onSaved: (n: string) => void; onError: (m: string) => void }> = ({ order, onSaved, onError }) => {
  const [v, setV] = useState(order.internal_note || '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = v !== (order.internal_note || '');
  return (
    <div className="ord-note">
      <label htmlFor={`note-${order.id}`}>Nota interna (no la ve el cliente)</label>
      <textarea id={`note-${order.id}`} rows={2} value={v} onChange={e => { setV(e.target.value); setState('idle'); }} placeholder="Ej. comprado en Farmacias del Ahorro, llega el jueves" />
      <button type="button" className="ord-btn" disabled={!dirty || state === 'saving'} onClick={async () => {
        setState('saving');
        const err = await updateOrder(order.id, { internal_note: v } as Partial<Order>);
        if (err) { setState('idle'); return onError(`No se guardó la nota: ${err}`); }
        setState('saved'); onSaved(v);
      }}>{state === 'saving' ? 'Guardando…' : state === 'saved' && !dirty ? <><Check size={13} /> Guardada</> : 'Guardar nota'}</button>
    </div>
  );
};

/* ── Modal: enviar pedido (paquetería · entrega personal · directo del proveedor) ── */
const SHIP_KINDS: Array<{ k: ShipKind; icon: React.ReactNode; title: string; hint: string }> = [
  { k: 'paqueteria', icon: <Truck size={13} aria-hidden="true" />, title: 'Paquetería', hint: 'Tú lo envías con guía' },
  { k: 'personal', icon: <Users size={13} aria-hidden="true" />, title: 'Entrega personal', hint: 'Lo llevas o lo recogen' },
  { k: 'proveedor', icon: <Package size={13} aria-hidden="true" />, title: 'Directo del proveedor', hint: 'La marca o tienda se lo envía' },
];

const ShipModal: React.FC<{
  order: Order; onClose: () => void; onLabel: (o: Order) => void;
  onDone: (patch: Partial<Order>, msg: { kind: 'ok' | 'err'; text: string }) => void;
}> = ({ order, onClose, onDone, onLabel }) => {
  const initial = shipKindOf(order.shipping_carrier);
  const [kind, setKind] = useState<ShipKind>(order.shipping_carrier ? initial.kind : 'paqueteria');
  const [carrier, setCarrier] = useState(initial.carrier && CARRIERS.includes(initial.carrier) ? initial.carrier : initial.carrier ? 'Otra' : 'Estafeta');
  const [otherCarrier, setOtherCarrier] = useState(initial.carrier && !CARRIERS.includes(initial.carrier) ? initial.carrier : '');
  const [supplier, setSupplier] = useState(initial.supplier);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [tracking, setTracking] = useState(order.tracking_number || '');
  const [url, setUrl] = useState(order.tracking_url || '');
  const [delivered, setDelivered] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(Boolean(order.customer_email) && !order.shipping_notified_at);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // Proveedor sugerido: el principal de los productos del pedido (Precios automáticos)
  useEffect(() => {
    const ids = itemsOf(order).map(i => i.product?.id).filter(Boolean) as string[];
    if (!ids.length) return;
    void supabase.from('product_sources').select('shop').in('product_id', ids).eq('is_primary', true).then(({ data }) => {
      const list = [...new Set((data ?? []).map((r: { shop: string }) => r.shop).filter(Boolean))];
      setSuppliers(list);
      if (list.length && !initial.supplier) setSupplier(list[0]);
    }, () => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const carrierName = carrier === 'Otra' ? otherCarrier.trim() : carrier;
  const urlOk = !url || /^https?:\/\//i.test(url.trim());
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === 'paqueteria' && !carrierName) return setError('Escribe el nombre de la paquetería.');
    if (kind === 'paqueteria' && !tracking.trim()) return setError('Escribe el número de guía.');
    if (kind === 'proveedor' && !supplier.trim()) return setError('Escribe quién lo envía (marca o tienda).');
    if (!urlOk) return setError('El enlace de rastreo debe empezar con https://');
    setSaving(true); setError('');
    const label = kind === 'personal' ? 'Entrega personal' : kind === 'proveedor' ? `Directo de: ${supplier.trim()}` : carrierName;
    const patch: Partial<Order> = {
      status: kind === 'personal' && delivered ? 'delivered' : 'shipped',
      shipping_carrier: label,
      tracking_number: kind === 'personal' ? null : tracking.trim() || null,
      tracking_url: kind === 'personal' ? null : url.trim() || null,
      shipped_at: order.shipped_at || new Date().toISOString(),
    };
    const err = await updateOrder(order.id, patch);
    if (err) { setSaving(false); return setError(`No se guardó: ${err}`); }
    const done = patch.status === 'delivered' ? 'Pedido marcado como entregado' : 'Pedido marcado como enviado';
    if (notifyCustomer) {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: JSON.stringify({ type: 'order-shipped', orderId: order.id }),
      });
      const d = await r.json().catch(() => ({}));
      setSaving(false);
      if (!r.ok) return onDone(patch, { kind: 'err', text: `${done}, pero el correo falló: ${d.error || r.status}` });
      return onDone({ ...patch, shipping_notified_at: new Date().toISOString() }, { kind: 'ok', text: `${done} y cliente avisado por correo.` });
    }
    setSaving(false);
    onDone(patch, { kind: 'ok', text: `${done}.` });
  };

  return (
    <div className="ord-modal" role="dialog" aria-modal="true" aria-labelledby="ship-title" onClick={() => !saving && onClose()}>
      <form className="ord-modal__panel" onClick={e => e.stopPropagation()} onSubmit={submit} noValidate>
        <header>
          <h2 id="ship-title"><Truck size={16} aria-hidden="true" /> Enviar pedido #{shortId(order.id)}</h2>
          <button type="button" className="ord-icon" onClick={onClose} disabled={saving} aria-label="Cerrar"><X size={15} /></button>
        </header>
        <p className="ord-modal__to"><strong>{order.customer_name}</strong> · {[order.customer_city, order.customer_state].filter(Boolean).join(', ')}</p>

        <div className="ord-seg" role="radiogroup" aria-label="Forma de entrega">
          {SHIP_KINDS.map(x => (
            <button key={x.k} type="button" role="radio" aria-checked={kind === x.k} onClick={() => { setKind(x.k); setError(''); }} autoFocus={kind === x.k}>
              <strong>{x.icon} {x.title}</strong><span>{x.hint}</span>
            </button>
          ))}
        </div>

        {kind === 'paqueteria' && (
          <div className="ord-grid2">
            <label className="ord-field">Paquetería
              <select value={carrier} onChange={e => setCarrier(e.target.value)}>{CARRIERS.map(c => <option key={c}>{c}</option>)}</select>
            </label>
            {carrier === 'Otra'
              ? <label className="ord-field">Nombre de la paquetería<input value={otherCarrier} onChange={e => setOtherCarrier(e.target.value)} placeholder="Ej. JT Express" /></label>
              : <span />}
          </div>
        )}
        {kind === 'proveedor' && (
          <label className="ord-field">Quién lo envía (marca o tienda)
            <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Ej. Amazon, ISDIN, Liverpool" list="ship-suppliers" />
            <datalist id="ship-suppliers">{suppliers.map(x => <option key={x} value={x} />)}</datalist>
          </label>
        )}
        {kind !== 'personal' ? (
          <>
            <div className="ord-grid2">
              <label className="ord-field">Número de guía{kind === 'proveedor' ? ' (si te la dieron)' : ''}
                <input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Ej. 1234567890" autoComplete="off" />
              </label>
              <label className="ord-field">Enlace de rastreo (opcional)
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" inputMode="url" aria-invalid={!urlOk} />
              </label>
            </div>
            {kind === 'proveedor' && <p className="ord-muted" style={{ margin: 0, fontSize: 12 }}>Al cliente le decimos que sale directo del almacén de la marca o distribuidor y que puede llegar con su empaque.</p>}
          </>
        ) : (
          <label className="ord-check">
            <input type="checkbox" checked={delivered} onChange={e => setDelivered(e.target.checked)} />
            Ya lo entregué (marcar como Entregado)
          </label>
        )}

        <label className="ord-check">
          <input type="checkbox" checked={notifyCustomer} disabled={!order.customer_email} onChange={e => setNotifyCustomer(e.target.checked)} />
          Avisar al cliente por correo{order.customer_email ? ` (${order.customer_email})` : ' (sin correo)'}{order.shipping_notified_at ? ' — ya se le avisó una vez' : ''}
        </label>
        {error && <p className="ord-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="ord-btn" onClick={() => onLabel({ ...order, shipping_carrier: kind === 'paqueteria' ? carrierName : order.shipping_carrier, tracking_number: tracking })}><Tag size={13} /> Etiqueta</button>
          <span className="ord-spacer" />
          <button type="button" className="ord-btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="ord-btn ord-btn--primary" disabled={saving}>
            {saving ? 'Guardando…' : kind === 'personal' && delivered ? 'Marcar como entregado' : 'Marcar como enviado'}
          </button>
        </footer>
      </form>
    </div>
  );
};

/* ── Ajustes: correo de avisos y remitente de etiquetas ── */
const ConfigPanel: React.FC<{ cfg: ShipCfg; onSaved: (c: ShipCfg) => void; onError: (m: string) => void }> = ({ cfg, onSaved, onError }) => {
  const [v, setV] = useState<ShipCfg>(cfg);
  const [saving, setSaving] = useState(false);
  const emailsOk = v.orders_notify_email.split(',').map(x => x.trim()).filter(Boolean).every(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const field = (k: keyof ShipCfg, label: string, ph = '') => (
    <label className="ord-field">{label}<input value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} placeholder={ph} /></label>
  );
  return (
    <section className="ord-cfg" aria-label="Ajustes de pedidos">
      <div className="ord-cfg__grid">
        <label className="ord-field ord-cfg__wide">Avisarme de pedidos nuevos en (separa varios con coma)
          <input value={v.orders_notify_email} onChange={e => setV({ ...v, orders_notify_email: e.target.value })} placeholder="tu@correo.com" aria-invalid={!emailsOk} />
        </label>
        {field('ship_from_name', 'Remitente', 'Divina Store MX')}
        {field('ship_from_phone', 'Teléfono remitente', '55 1234 5678')}
        {field('ship_from_address', 'Calle y número, colonia')}
        {field('ship_from_city', 'Ciudad / Alcaldía')}
        {field('ship_from_state', 'Estado', 'CDMX')}
        {field('ship_from_zip', 'CP')}
      </div>
      <div className="ord-inline">
        <span className="ord-muted">El remitente sale en las etiquetas. El aviso llega cuando un pago se aprueba.</span>
        <span className="ord-spacer" />
        <button type="button" className="ord-btn ord-btn--primary" disabled={saving || !emailsOk} onClick={async () => {
          setSaving(true);
          const rows = CFG_KEYS.map(k => ({ key: k, value: v[k].trim() }));
          const { error } = await supabase.from('store_config').upsert(rows, { onConflict: 'key' });
          setSaving(false);
          if (error) return onError(`No se pudieron guardar los ajustes: ${error.message}`);
          onSaved(v);
        }}>{saving ? 'Guardando…' : 'Guardar ajustes'}</button>
      </div>
    </section>
  );
};

/* ── Pago Clip: celda de la tabla ── */
const ClipCell: React.FC<{ order: Order; busy: boolean; onVerify: () => void }> = ({ order: o, busy, onVerify }) => {
  const k = clipKey(o);
  const mm = clipMismatch(o);
  const c = CLIP[k];
  const tone = mm ? 'bad' : c.tone;
  const no = clipNo(o);
  return (
    <div className="ord-pay">
      <button
        type="button"
        className={`ord-pay__chip t-${tone}`}
        onClick={onVerify}
        disabled={busy || k === 'none'}
        title={mm ? `Clip cobró ${money(Number(o.clip_amount))} y el pedido es de ${money(o.total)}` : `${c.hint}${k !== 'none' ? ' · clic para consultar a Clip' : ''}`}
        aria-label={`Pago Clip: ${mm ? 'monto distinto' : c.label}. Consultar a Clip`}
      >
        {busy ? <RefreshCw size={11} className="ord-spin" aria-hidden="true" /> : k === 'approved' && !mm ? <ShieldCheck size={11} aria-hidden="true" /> : null}
        {busy ? 'Consultando' : mm ? 'Monto distinto' : c.label}
      </button>
      {no && <span className="ord-pay__no" title={o.clip_card || undefined}>{no}</span>}
    </div>
  );
};

/* ── Pago Clip: detalle dentro del pedido ── */
const ClipDetail: React.FC<{ order: Order; busy: boolean; overridden: boolean; onVerify: () => void; onOverride: () => void }> = ({ order: o, busy, overridden, onVerify, onOverride }) => {
  const [ask, setAsk] = useState(false);
  const k = clipKey(o);
  const mm = clipMismatch(o);
  const pid = clipPid(o);
  const paid = PAID.includes((o.status || 'pending') as Status);
  const rows: [string, string][] = [
    ['Estado en Clip', mm ? 'Monto distinto' : CLIP[k].label + (o.clip_status_code ? ` (${o.clip_status_code})` : '')],
    ['Autorización', o.clip_auth_code || '—'],
    ['Recibo Clip', o.clip_receipt_no || '—'],
    ['Tarjeta', o.clip_card || '—'],
    ['Monto cobrado', o.clip_amount != null ? money(Number(o.clip_amount)) : '—'],
    ['Aprobado', fmtDate(o.clip_approved_at)],
    ['ID de pago', pid || '—'],
    ['Consultado', o.clip_verified_at ? fmtDate(o.clip_verified_at) : 'nunca'],
  ];
  return (
    <div className={`ord-paybox t-${mm ? 'bad' : CLIP[k].tone}`}>
      <div className="ord-paybox__head">
        <h4><CreditCard size={12} aria-hidden="true" /> Pago Clip</h4>
        <button type="button" className="ord-btn" disabled={busy || !pid} onClick={onVerify}>
          <RefreshCw size={12} className={busy ? 'ord-spin' : ''} aria-hidden="true" /> {busy ? 'Consultando…' : 'Consultar a Clip'}
        </button>
      </div>
      <dl>
        {rows.map(([a, b]) => <React.Fragment key={a}><dt>{a}</dt><dd className={a === 'ID de pago' ? 'is-mono' : ''}>{b}</dd></React.Fragment>)}
      </dl>
      {paid && !clipOk(o) && (
        overridden ? (
          <p className="ord-paybox__warn"><AlertTriangle size={12} aria-hidden="true" /> Envío habilitado manualmente para este pedido.</p>
        ) : ask ? (
          <p className="ord-paybox__warn">
            <AlertTriangle size={12} aria-hidden="true" /> ¿Ya lo viste aprobado en tu panel de Clip?
            <button type="button" className="ord-btn ord-btn--danger" onClick={() => { onOverride(); setAsk(false); }}>Sí, habilitar envío</button>
            <button type="button" className="ord-btn" onClick={() => setAsk(false)}>No</button>
          </p>
        ) : (
          <p className="ord-paybox__warn">
            <AlertTriangle size={12} aria-hidden="true" /> No se puede enviar hasta que Clip confirme el cobro.
            <button type="button" className="ord-link" onClick={() => setAsk(true)}>Enviar de todos modos</button>
          </p>
        )
      )}
    </div>
  );
};

/* ── Modal: pagos Clip ── */
type ClipFilter = 'all' | 'approved' | 'pending' | 'problem' | 'unverified';
const ClipModal: React.FC<{
  orders: Order[]; verifying: string[] | 'all' | null;
  onVerify: (ids?: string[]) => void; onClose: () => void; onGo: (id: string) => void;
}> = ({ orders, verifying, onVerify, onClose, onGo }) => {
  const [f, setF] = useState<ClipFilter>('all');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Cobros de Clip + pedidos marcados como pagados sin cobro registrado (sospechosos)
  const rows = useMemo(() => orders
    .filter(o => clipPid(o) || o.clip_status || PAID.includes((o.status || 'pending') as Status))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')), [orders]);

  const group = (o: Order): ClipFilter => {
    const k = clipKey(o);
    if (k === 'approved' && !clipMismatch(o)) return 'approved';
    if (k === 'pending' || k === 'authorized') return 'pending';
    if (k === 'unverified') return 'unverified';
    return 'problem'; // rechazado, cancelado, reembolsado, monto distinto o pagado sin cobro
  };
  const n = (g: ClipFilter) => rows.filter(o => group(o) === g).length;
  const charged = rows.filter(o => clipKey(o) === 'approved');
  const approvedSum = charged.reduce((s, o) => s + Number(o.clip_amount ?? o.total ?? 0), 0);
  const shown = f === 'all' ? rows : rows.filter(o => group(o) === f);
  const all = verifying === 'all';
  const busyRow = (id: string) => all || (Array.isArray(verifying) && verifying.includes(id));
  const checkable = rows.filter(o => clipPid(o)).map(o => o.id);

  const FILTERS: [ClipFilter, string, string?][] = [
    ['all', 'Todos'], ['approved', 'Aprobados', 'ok'], ['pending', 'En proceso', 'warn'], ['problem', 'Con problema', 'bad'], ['unverified', 'Sin verificar'],
  ];

  return (
    <div className="ord-modal" role="dialog" aria-modal="true" aria-labelledby="clip-title" onClick={onClose}>
      <div className="ord-modal__panel ord-clipm" onClick={e => e.stopPropagation()}>
        <header>
          <h2 id="clip-title"><CreditCard size={16} aria-hidden="true" /> Pagos Clip</h2>
          <div className="ord-inline">
            <button type="button" className="ord-btn ord-btn--primary" disabled={Boolean(verifying) || !checkable.length} onClick={() => onVerify(checkable.slice(0, 60))}>
              <RefreshCw size={13} className={all || Array.isArray(verifying) ? 'ord-spin' : ''} aria-hidden="true" /> {verifying ? 'Consultando a Clip…' : 'Verificar todo con Clip'}
            </button>
            <button ref={closeRef} type="button" className="ord-icon" onClick={onClose} aria-label="Cerrar"><X size={15} /></button>
          </div>
        </header>

        <div className="ord-kpis ord-kpis--tight" role="list">
          <Kpi label="Cobrado (Clip)" value={money(approvedSum)} hint={`${charged.length} cobro${charged.length === 1 ? '' : 's'}`} tone="ok" />
          <Kpi label="En proceso" value={String(n('pending'))} tone={n('pending') ? 'warn' : undefined} />
          <Kpi label="Con problema" value={String(n('problem'))} tone={n('problem') ? 'warn' : undefined} />
          <Kpi label="Sin verificar" value={String(n('unverified'))} />
        </div>

        <div className="ord-chips" role="group" aria-label="Filtrar pagos">
          {FILTERS.map(([k, label, tone]) => (
            <button key={k} type="button" className={`ord-chip ${f === k ? 'is-on' : ''} ${tone ? `t-${tone}` : ''}`} aria-pressed={f === k} onClick={() => setF(k)}>
              {label} <em>{k === 'all' ? rows.length : n(k)}</em>
            </button>
          ))}
        </div>

        <div className="ord-table-wrap ord-clipm__table">
          {shown.length === 0 ? <div className="ord-empty">Nada en esta vista.</div> : (
            <table className="ord-table">
              <thead>
                <tr>
                  <th>Pedido</th><th>Cliente</th><th className="c-hide-sm">Tarjeta</th><th>Autorización / recibo</th><th className="c-num">Monto</th><th>Estado Clip</th><th className="c-hide-sm">Consultado</th><th className="c-act" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {shown.map(o => {
                  const k = clipKey(o); const mm = clipMismatch(o);
                  const noCharge = k === 'none';
                  return (
                    <tr key={o.id}>
                      <td>
                        <button type="button" className="ord-rowbtn" onClick={() => onGo(o.id)} title="Ver pedido"><span className="ord-id">#{shortId(o.id)}</span></button>
                        <span className="ord-date ord-date--flat">{fmtDate(o.created_at)}</span>
                      </td>
                      <td className="c-client"><strong>{o.customer_name || '—'}</strong><span>{o.customer_email || ''}</span></td>
                      <td className="ord-muted c-hide-sm">{o.clip_card || '—'}</td>
                      <td className="ord-mono">{o.clip_auth_code || o.clip_receipt_no || (noCharge ? '—' : <span className="ord-muted">pendiente</span>)}{o.clip_auth_code && o.clip_receipt_no ? <span className="ord-sub2">Rec. {o.clip_receipt_no}</span> : null}</td>
                      <td className="c-num">
                        <span className="ord-money">{o.clip_amount != null ? money(Number(o.clip_amount)) : '—'}</span>
                        {mm && <span className="ord-sub2 is-bad">pedido {money(o.total)}</span>}
                      </td>
                      <td>
                        <span className={`ord-pay__chip is-static t-${mm ? 'bad' : noCharge && PAID.includes((o.status || 'pending') as Status) ? 'bad' : CLIP[k].tone}`} title={CLIP[k].hint}>
                          {mm ? 'Monto distinto' : noCharge && PAID.includes((o.status || 'pending') as Status) ? 'Pagado sin cobro' : CLIP[k].label}
                        </span>
                      </td>
                      <td className="ord-muted c-hide-sm">{o.clip_verified_at ? fmtDate(o.clip_verified_at) : '—'}</td>
                      <td className="c-act">
                        <button type="button" className="ord-icon" disabled={!clipPid(o) || busyRow(o.id)} onClick={() => onVerify([o.id])} title="Consultar a Clip" aria-label={`Consultar a Clip el pedido ${shortId(o.id)}`}>
                          <RefreshCw size={14} className={busyRow(o.id) ? 'ord-spin' : ''} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="ord-muted ord-clipm__note">
          Estado, recibo, tarjeta y monto vienen directo de la API de Clip. Solo se puede enviar un pedido cuando Clip lo reporta <strong>Aprobado</strong> y el monto coincide.
        </p>
      </div>
    </div>
  );
};
