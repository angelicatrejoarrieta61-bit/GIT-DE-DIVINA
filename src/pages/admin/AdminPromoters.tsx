import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Order, Promoter } from '../../types';
import './AdminPromoters.css';

type PromoterSummary = Promoter & {
  orders: Order[];
  salesCount: number;
  unitsCount: number;
  salesTotal: number;
  pendingCommission: number;
  paidCommission: number;
};

const money = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const date = (value?: string) => value ? new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const AdminPromoters: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const [promotersResult, ordersResult] = await Promise.all([
      supabase.from('promoters').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').not('promoter_id', 'is', null).order('created_at', { ascending: false }),
    ]);
    if (promotersResult.error) setError('No se pudo leer el programa. Verifica que la migración de promotores esté aplicada.');
    setPromoters((promotersResult.data || []) as Promoter[]);
    setOrders((ordersResult.data || []) as Order[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const summaries = useMemo<PromoterSummary[]>(() => promoters.map(promoter => {
    const promoterOrders = orders.filter(order => order.promoter_id === promoter.id && ['paid', 'shipped', 'delivered'].includes(order.status || ''));
    return {
      ...promoter,
      orders: promoterOrders,
      salesCount: promoterOrders.length,
      unitsCount: promoterOrders.reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
      salesTotal: promoterOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      pendingCommission: promoterOrders.filter(order => order.commission_status === 'pending').reduce((sum, order) => sum + Number(order.commission_amount || 0), 0),
      paidCommission: promoterOrders.filter(order => order.commission_status === 'paid').reduce((sum, order) => sum + Number(order.commission_amount || 0), 0),
    };
  }).filter(promoter => {
    const query = search.trim().toLowerCase();
    return !query || promoter.full_name.toLowerCase().includes(query) || promoter.email.toLowerCase().includes(query) || promoter.code.toLowerCase().includes(query);
  }), [promoters, orders, search]);

  const totals = useMemo(() => summaries.reduce((acc, promoter) => ({
    sales: acc.sales + promoter.salesCount,
    amount: acc.amount + promoter.salesTotal,
    pending: acc.pending + promoter.pendingCommission,
  }), { sales: 0, amount: 0, pending: 0 }), [summaries]);

  const toggleStatus = async (promoter: Promoter) => {
    setWorking(promoter.id);
    const nextStatus = promoter.status === 'active' ? 'paused' : 'active';
    const { error: updateError } = await supabase.from('promoters').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', promoter.id);
    if (updateError) window.alert('No se pudo cambiar el estado.');
    else setPromoters(current => current.map(item => item.id === promoter.id ? { ...item, status: nextStatus } : item));
    setWorking(null);
  };

  const markPaid = async (promoter: PromoterSummary) => {
    const pendingIds = promoter.orders.filter(order => order.commission_status === 'pending').map(order => order.id);
    if (!pendingIds.length) return;
    if (!window.confirm(`Confirmar que ya pagaste ${money(promoter.pendingCommission)} a ${promoter.full_name}.`)) return;
    setWorking(promoter.id);
    const paidAt = new Date().toISOString();
    const { error: updateError } = await supabase.from('orders').update({ commission_status: 'paid', commission_paid_at: paidAt }).in('id', pendingIds);
    if (updateError) window.alert('No se pudo registrar el pago.');
    else setOrders(current => current.map(order => pendingIds.includes(order.id) ? { ...order, commission_status: 'paid', commission_paid_at: paidAt } : order));
    setWorking(null);
  };

  const exportCsv = () => {
    const rows = [['Nombre', 'Correo', 'Código', 'Estado', 'Ventas', 'Unidades', 'Total vendido', 'Comisión pendiente', 'Comisión pagada']];
    summaries.forEach(p => rows.push([p.full_name, p.email, p.code, p.status, String(p.salesCount), String(p.unitsCount), p.salesTotal.toFixed(2), p.pendingCommission.toFixed(2), p.paidCommission.toFixed(2)]));
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n');
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = href; anchor.download = `promotores-divina-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(href);
  };

  return (
    <div className="promoters-admin">
      <div className="promoters-admin__header">
        <div><span className="promoters-admin__kicker">PROGRAMA DE PROMOCIÓN</span><h1>Promotores y comisiones</h1><p>Consulta quién vendió, cuánto generó y qué comisión falta pagar.</p></div>
        <button className="btn btn-outline" onClick={exportCsv} disabled={!summaries.length}>Exportar CSV</button>
      </div>

      <div className="promoters-admin__stats">
        <article><span>Promotores</span><strong>{promoters.length}</strong></article>
        <article><span>Ventas atribuidas</span><strong>{totals.sales}</strong></article>
        <article><span>Total vendido</span><strong>{money(totals.amount)}</strong></article>
        <article className="is-lime"><span>Por pagar</span><strong>{money(totals.pending)}</strong></article>
      </div>

      <div className="promoters-admin__toolbar"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre, correo o código" /><button onClick={() => void load()}>Actualizar</button></div>
      {error && <div className="promoters-admin__error">{error}</div>}
      {loading ? <div className="promoters-admin__empty">Cargando promotores…</div> : summaries.length === 0 ? <div className="promoters-admin__empty">Todavía no hay promotores registrados.</div> : (
        <div className="promoters-admin__list">
          {summaries.map(promoter => (
            <article className="promoter-row" key={promoter.id}>
              <div className="promoter-row__main">
                <button className="promoter-row__identity" onClick={() => setExpanded(expanded === promoter.id ? null : promoter.id)}>
                  <span className="promoter-avatar">{promoter.full_name.slice(0, 1).toUpperCase()}</span>
                  <span><strong>{promoter.full_name}</strong><small>{promoter.email} · {promoter.code}</small></span>
                </button>
                <div className="promoter-row__metric"><span>Ventas</span><strong>{promoter.salesCount} <small>({promoter.unitsCount} productos)</small></strong></div>
                <div className="promoter-row__metric"><span>Vendido</span><strong>{money(promoter.salesTotal)}</strong></div>
                <div className="promoter-row__metric promoter-row__metric--lime"><span>Por pagar</span><strong>{money(promoter.pendingCommission)}</strong></div>
                <div className="promoter-row__actions">
                  <button className={promoter.status === 'active' ? 'status-active' : 'status-paused'} onClick={() => void toggleStatus(promoter)} disabled={working === promoter.id}>{promoter.status === 'active' ? 'Activo' : 'Pausado'}</button>
                  <button className="pay-button" onClick={() => void markPaid(promoter)} disabled={!promoter.pendingCommission || working === promoter.id}>Marcar pagado</button>
                </div>
              </div>
              {expanded === promoter.id && (
                <div className="promoter-row__details">
                  <div className="promoter-row__contact"><span>Teléfono: {promoter.phone || '—'}</span><span>Red: {promoter.social_handle || '—'}</span><span>Inscrito: {date(promoter.created_at)}</span><span>Comisión pagada histórica: {money(promoter.paidCommission)}</span></div>
                  {promoter.orders.length ? promoter.orders.map(order => <div className="promoter-sale" key={order.id}><span><strong>{order.customer_name || 'Cliente'}</strong><small>{date(order.created_at)} · {order.items?.map(item => `${item.quantity}× ${item.product.name}`).join(', ')}</small></span><span>{money(order.total)}<small>Comisión: {money(Number(order.commission_amount || 0))} · {order.commission_status === 'paid' ? 'pagada' : 'pendiente'}</small></span></div>) : <p>Este promotor todavía no tiene ventas pagadas.</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

