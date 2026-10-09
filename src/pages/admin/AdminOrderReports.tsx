/**
 * AdminOrderReports.tsx — Pedidos y clientes (/admin/reportes)
 * Resumen en fichas, búsqueda, filtros por estado y periodo, selección múltiple,
 * borrar, marcar como enviado (paquetería + guía + aviso por correo), etiqueta
 * imprimible, avisos de pedido nuevo y acceso a campañas desde Clientes.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, RefreshCw, Download, Settings2, Truck, Tag, Trash2, ChevronDown, ChevronRight,
  Mail, MessageCircle, Copy, Check, X, Send, Package, Users, AlertTriangle,
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
const CARRIERS = ['Estafeta', 'DHL', 'FedEx', 'Paquetexpress', 'Redpack', '99 Minutos', 'Correos de México', 'Entrega local', 'Otra'];
const PERIODS: Record<Period, string> = { all: 'Todo', today: 'Hoy', '7d': '7 días', '30d': '30 días', month: 'Este mes' };

const CFG_KEYS = ['orders_notify_email', 'ship_from_name', 'ship_from_phone', 'ship_from_address', 'ship_from_city', 'ship_from_state', 'ship_from_zip'] as const;
type ShipCfg = Record<(typeof CFG_KEYS)[number], string>;
const EMPTY_CFG: ShipCfg = { orders_notify_email: 'admin@divinastore.com.mx', ship_from_name: 'Divina Store MX', ship_from_phone: '', ship_from_address: '', ship_from_city: '', ship_from_state: '', ship_from_zip: '' };

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
  const toastTimer = useRef<number | undefined>(undefined);

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

  useEffect(() => {
    void load();
    getStoreConfig().then(c => setCfg(prev => {
      const next = { ...prev };
      CFG_KEYS.forEach(k => { if (c[k] !== undefined && c[k] !== '') next[k] = c[k]; });
      return next;
    }));
  }, [load]);

  /* ── Datos derivados ── */
  const inRange = useMemo(() => orders.filter(o => inPeriod(o.created_at, period)), [orders, period]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return inRange.filter(o => {
      if (status !== 'all' && (o.status || 'pending') !== status) return false;
      if (!t) return true;
      return [o.customer_name, o.customer_email, o.customer_phone, o.id, o.tracking_number, o.customer_city]
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

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1500); } catch { notify('err', 'No se pudo copiar.'); }
  };

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };
  const allVisibleSelected = filtered.length > 0 && filtered.every(o => sel.has(o.id));

  const goCampaign = (emails: string[]) => navigate(`/admin/newsletter?para=${encodeURIComponent(emails.join(','))}`);

  const exportOrders = () => downloadCSV(`divina_pedidos_${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Pedido', 'Fecha', 'Estado', 'Cliente', 'Email', 'Teléfono', 'Dirección', 'Colonia', 'Ciudad', 'Estado (lugar)', 'CP', 'Referencia', 'Productos', 'Piezas', 'Total', 'Paquetería', 'Guía'],
    ...filtered.map(o => [shortId(o.id), fmtDate(o.created_at), STATUS[(o.status || 'pending') as Status]?.label || o.status || '', o.customer_name || '', o.customer_email || '', o.customer_phone || '',
      o.customer_address || '', o.customer_neighborhood || '', o.customer_city || '', o.customer_state || '', o.customer_zip || '', o.customer_reference || '',
      itemsOf(o).map(i => `${i.quantity}x ${i.product?.name}`).join(' | '), String(unitsOf(o)), money(o.total), o.shipping_carrier || '', o.tracking_number || '']),
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
                    <th>Pedido</th><th>Cliente</th><th className="c-num c-hide-sm">Pzs</th><th className="c-num">Total</th><th>Estado</th><th className="c-hide-sm">Envío</th><th className="c-act">Acciones</th>
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
                          <td>
                            <select className={`ord-status t-${STATUS[st]?.tone}`} value={st} disabled={busy === o.id} onChange={e => void changeStatus(o, e.target.value as Status)} aria-label="Estado del pedido">
                              {(Object.keys(STATUS) as Status[]).map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}
                            </select>
                          </td>
                          <td className="c-ship c-hide-sm">{o.tracking_number ? <><strong>{o.shipping_carrier || 'Guía'}</strong><span>{o.tracking_number}</span></> : <span className="ord-muted">—</span>}</td>
                          <td className="c-act">
                            {confirmDel === o.id ? (
                              <span className="ord-confirm ord-confirm--row">
                                ¿Borrar?
                                <button type="button" className="ord-icon ord-icon--danger" disabled={busy === 'delete'} onClick={() => void doDelete([o.id])} aria-label="Confirmar borrar"><Check size={14} /></button>
                                <button type="button" className="ord-icon" onClick={() => setConfirmDel(null)} aria-label="Cancelar"><X size={14} /></button>
                              </span>
                            ) : (
                              <>
                                <button type="button" className="ord-icon ord-icon--primary" onClick={() => setShipFor(o)} disabled={!PAID.includes(st)} title={!PAID.includes(st) ? 'Solo pedidos pagados' : o.tracking_number ? 'Editar envío' : 'Enviar pedido'} aria-label="Enviar pedido"><Truck size={15} /></button>
                                <button type="button" className="ord-icon" onClick={() => printLabel(o, cfg)} title="Crear etiqueta" aria-label="Crear etiqueta"><Tag size={15} /></button>
                                <button type="button" className="ord-icon ord-icon--danger" onClick={() => setConfirmDel(o.id)} title="Borrar pedido" aria-label="Borrar pedido"><Trash2 size={15} /></button>
                              </>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="ord-detail"><td colSpan={8}>
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
                                  <li className={o.customer_notified_at ? 'is-ok' : ''}>Confirmación al cliente: {o.customer_notified_at ? fmtDate(o.customer_notified_at) : 'no enviada'}</li>
                                  <li className={o.shipping_notified_at ? 'is-ok' : ''}>Aviso de envío: {o.shipping_notified_at ? fmtDate(o.shipping_notified_at) : 'no enviado'}</li>
                                </ul>
                                {PAID.includes(st) && (
                                  <button type="button" className="ord-link" disabled={busy === o.id} onClick={() => void resendPaidNotice(o)}>Reenviarme el aviso de este pedido</button>
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

/* ── Modal: enviar pedido ── */
const ShipModal: React.FC<{
  order: Order; onClose: () => void; onLabel: (o: Order) => void;
  onDone: (patch: Partial<Order>, msg: { kind: 'ok' | 'err'; text: string }) => void;
}> = ({ order, onClose, onDone, onLabel }) => {
  const [carrier, setCarrier] = useState(order.shipping_carrier || 'Estafeta');
  const [tracking, setTracking] = useState(order.tracking_number || '');
  const [url, setUrl] = useState(order.tracking_url || '');
  const [notifyCustomer, setNotifyCustomer] = useState(Boolean(order.customer_email) && !order.shipping_notified_at);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const urlOk = !url || /^https?:\/\//i.test(url.trim());
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tracking.trim() && carrier !== 'Entrega local') return setError('Escribe el número de guía.');
    if (!urlOk) return setError('El enlace de rastreo debe empezar con https://');
    setSaving(true); setError('');
    const patch: Partial<Order> = { status: 'shipped', shipping_carrier: carrier, tracking_number: tracking.trim() || null, tracking_url: url.trim() || null, shipped_at: order.shipped_at || new Date().toISOString() };
    const err = await updateOrder(order.id, patch);
    if (err) { setSaving(false); return setError(`No se guardó: ${err}. ¿Ejecutaste la migración de pedidos v2?`); }
    if (notifyCustomer) {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: JSON.stringify({ type: 'order-shipped', orderId: order.id }),
      });
      const d = await r.json().catch(() => ({}));
      setSaving(false);
      if (!r.ok) return onDone(patch, { kind: 'err', text: `Pedido marcado como enviado, pero el correo falló: ${d.error || r.status}` });
      return onDone({ ...patch, shipping_notified_at: new Date().toISOString() }, { kind: 'ok', text: 'Pedido enviado y cliente avisado por correo.' });
    }
    setSaving(false);
    onDone(patch, { kind: 'ok', text: 'Pedido marcado como enviado.' });
  };

  return (
    <div className="ord-modal" role="dialog" aria-modal="true" aria-labelledby="ship-title" onClick={() => !saving && onClose()}>
      <form className="ord-modal__panel" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <header>
          <h2 id="ship-title"><Truck size={16} aria-hidden="true" /> Enviar pedido #{shortId(order.id)}</h2>
          <button type="button" className="ord-icon" onClick={onClose} disabled={saving} aria-label="Cerrar"><X size={15} /></button>
        </header>
        <p className="ord-modal__to"><strong>{order.customer_name}</strong> · {[order.customer_city, order.customer_state].filter(Boolean).join(', ')}</p>
        <div className="ord-grid2">
          <label className="ord-field">Paquetería
            <select ref={firstRef} value={carrier} onChange={e => setCarrier(e.target.value)}>{CARRIERS.map(c => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="ord-field">Número de guía
            <input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Ej. 1234567890" autoComplete="off" />
          </label>
        </div>
        <label className="ord-field">Enlace de rastreo (opcional)
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… (pégalo desde la paquetería)" inputMode="url" aria-invalid={!urlOk} />
        </label>
        <label className="ord-check">
          <input type="checkbox" checked={notifyCustomer} disabled={!order.customer_email} onChange={e => setNotifyCustomer(e.target.checked)} />
          Avisar al cliente por correo{order.customer_email ? ` (${order.customer_email})` : ' (sin correo)'}{order.shipping_notified_at ? ' — ya se le avisó una vez' : ''}
        </label>
        {error && <p className="ord-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="ord-btn" onClick={() => onLabel({ ...order, shipping_carrier: carrier, tracking_number: tracking })}><Tag size={13} /> Etiqueta</button>
          <span className="ord-spacer" />
          <button type="button" className="ord-btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="ord-btn ord-btn--primary" disabled={saving}>{saving ? 'Guardando…' : 'Marcar como enviado'}</button>
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
