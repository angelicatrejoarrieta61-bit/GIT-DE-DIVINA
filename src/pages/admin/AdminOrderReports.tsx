import React, { useEffect, useState, useMemo } from 'react';
import { getOrders, updateOrderStatus, deleteAllOrders } from '../../lib/queries';
import type { Order, CartItem } from '../../types';

type StatusType = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
type TabType = 'orders' | 'customers';

const STATUS_LABELS: Record<StatusType, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pendiente',   color: '#FFC107', bg: 'rgba(255,193,7,0.12)'  },
  paid:      { label: 'Pagado',      color: '#4CAF50', bg: 'rgba(76,175,80,0.12)'  },
  shipped:   { label: 'Enviado',     color: '#2196F3', bg: 'rgba(33,150,243,0.12)' },
  delivered: { label: 'Entregado',   color: '#9C27B0', bg: 'rgba(156,39,176,0.12)' },
  cancelled: { label: 'Cancelado',   color: '#ff6b6b', bg: 'rgba(255,107,107,0.12)'},
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtMXN(n: number) { return n.toLocaleString('es-MX', { minimumFractionDigits: 2 }); }

/* ── CSV Export Helper ── */
function downloadCSV(filename: string, rows: string[][]) {
  const bom = '\uFEFF';
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Unique Customer type ── */
interface UniqueCustomer {
  email: string;
  name: string;
  phone: string;
  city: string;
  state: string;
  totalOrders: number;
  totalSpent: number;
  lastOrder: string;
  acceptsMarketing: boolean;
}

export const AdminOrderReports: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>('orders');
  const [filterStatus, setFilterStatus] = useState<StatusType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => { loadOrders(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    setOrders(await getOrders());
    setLoading(false);
  };

  const handleStatusChange = async (id: string, s: StatusType) => {
    setUpdatingId(id);
    await updateOrderStatus(id, s);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: s } : o));
    setUpdatingId(null);
  };

  const handleDeleteAll = async () => {
    if (window.confirm('🚨 ¿ESTÁS SEGURO? Esto borrará TODOS los pedidos de la base de datos permanentemente. Esta acción no se puede deshacer.')) {
      setLoading(true);
      const success = await deleteAllOrders();
      if (success) {
        setOrders([]);
        alert('Todos los pedidos han sido eliminados.');
      } else {
        alert('Error al intentar borrar los pedidos.');
      }
      setLoading(false);
    }
  };

  /* ── Filtered orders ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      if (q && !(o.customer_name || '').toLowerCase().includes(q)
            && !(o.customer_email || '').toLowerCase().includes(q)
            && !o.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, filterStatus, search]);

  /* ── Unique customers ── */
  const customers = useMemo<UniqueCustomer[]>(() => {
    const map = new Map<string, UniqueCustomer>();
    orders.forEach(o => {
      const email = (o.customer_email || '').toLowerCase().trim();
      if (!email) return;
      const prev = map.get(email);
      if (prev) {
        prev.totalOrders++;
        prev.totalSpent += o.total || 0;
        if (o.created_at && o.created_at > prev.lastOrder) {
          prev.lastOrder = o.created_at;
          prev.name = o.customer_name || prev.name;
          prev.phone = o.customer_phone || prev.phone;
          prev.city = o.customer_city || prev.city;
          prev.state = o.customer_state || prev.state;
        }
        if (o.accepts_marketing) prev.acceptsMarketing = true;
      } else {
        map.set(email, {
          email, name: o.customer_name || '', phone: o.customer_phone || '',
          city: o.customer_city || '', state: o.customer_state || '',
          totalOrders: 1, totalSpent: o.total || 0,
          lastOrder: o.created_at || '', acceptsMarketing: !!o.accepts_marketing,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders]);

  /* ── Metrics ── */
  const metrics = useMemo(() => {
    const paid = orders.filter(o => ['paid','delivered','shipped'].includes(o.status || ''));
    const totalRevenue = paid.reduce((s, o) => s + (o.total || 0), 0);
    const totalPending = orders.filter(o => o.status === 'pending').reduce((s, o) => s + (o.total || 0), 0);
    const avg = orders.length ? orders.reduce((s, o) => s + (o.total || 0), 0) / orders.length : 0;
    const countByStatus: Record<string, number> = {};
    Object.keys(STATUS_LABELS).forEach(k => { countByStatus[k] = orders.filter(o => o.status === k).length; });
    const marketingEmails = customers.filter(c => c.acceptsMarketing).length;
    return { totalRevenue, totalPending, avg, countByStatus, uniqueCustomers: customers.length, marketingEmails };
  }, [orders, customers]);

  /* ── Export functions ── */
  const exportOrders = () => {
    const header = ['ID','Fecha','Nombre','Email','Teléfono','Dirección','Colonia','Ciudad','Estado','CP','Referencia','Productos','Qty','Total','Estado','Newsletter'];
    const rows = [header, ...filtered.map(o => [
      o.id.slice(0,8).toUpperCase(), fmtDate(o.created_at), o.customer_name||'', o.customer_email||'',
      o.customer_phone||'', o.customer_address||'', o.customer_neighborhood||'',
      o.customer_city||'', o.customer_state||'', o.customer_zip||'', o.customer_reference||'',
      Array.isArray(o.items) ? o.items.map((i:CartItem) => i.product?.name).join(' | ') : '',
      Array.isArray(o.items) ? String(o.items.reduce((s:number,i:CartItem) => s+i.quantity, 0)) : '',
      '$'+fmtMXN(o.total), STATUS_LABELS[(o.status as StatusType)||'pending']?.label || o.status || '',
      o.accepts_marketing ? 'Sí' : 'No',
    ])];
    downloadCSV(`divina_pedidos_${new Date().toISOString().slice(0,10)}.csv`, rows);
  };

  const exportCustomers = () => {
    const header = ['Email','Nombre','Teléfono','Ciudad','Estado','Pedidos','Total Gastado','Último Pedido','Acepta Marketing'];
    const rows = [header, ...customers.map(c => [
      c.email, c.name, c.phone, c.city, c.state,
      String(c.totalOrders), '$'+fmtMXN(c.totalSpent), fmtDate(c.lastOrder),
      c.acceptsMarketing ? 'Sí' : 'No',
    ])];
    downloadCSV(`divina_clientes_${new Date().toISOString().slice(0,10)}.csv`, rows);
  };

  const exportMarketingEmails = () => {
    const list = customers.filter(c => c.acceptsMarketing);
    const rows = [['Email','Nombre'], ...list.map(c => [c.email, c.name])];
    downloadCSV(`divina_newsletter_${new Date().toISOString().slice(0,10)}.csv`, rows);
  };

  const box: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' };
  const chip = (active: boolean, color: string, bg: string): React.CSSProperties => ({
    background: active ? bg : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
    color: active ? color : 'var(--c-text-muted)', borderRadius: 100, padding: '6px 14px',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--f-sub)',
  });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--c-text-muted)' }}>
      <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--c-lime)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Cargando reportes...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
<div style={{ padding: '28px 24px', maxWidth: 1200, margin: '0 auto', minHeight: '101vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, color: 'var(--c-lime)', marginBottom: 6 }}>📊 Reportes de Pedidos y Clientes</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: 13, margin: 0 }}>Gestión completa de pedidos, clientes y datos para email marketing.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
           <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Notificaciones de compras: <strong>admin@divinastore.com.mx</strong></p>
           <p style={{ fontSize: '11px', color: '#888', margin: '0 0 8px' }}>Gestión de Info/Newsletter: <strong>info@divinastore.com.mx</strong></p>
           <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
             <button onClick={handleDeleteAll} style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.3)', color: '#ff6b6b', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>🗑️ Empezar de Cero</button>
             <button onClick={loadOrders} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>🔄 Actualizar</button>
           </div>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Ventas Totales', value: `$${fmtMXN(metrics.totalRevenue)}`, color: 'var(--c-lime)' },
          { label: 'Pendiente', value: `$${fmtMXN(metrics.totalPending)}`, color: '#FFC107' },
          { label: 'Pedidos', value: orders.length, color: '#fff' },
          { label: 'Ticket Promedio', value: `$${fmtMXN(metrics.avg)}`, color: '#aaa' },
          { label: 'Clientes Únicos', value: metrics.uniqueCustomers, color: '#2196F3' },
          { label: 'Newsletter', value: `${metrics.marketingEmails} suscriptores`, color: '#9C27B0' },
        ].map(m => (
          <div key={m.label} style={box}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-muted)', margin: '0 0 4px' }}>{m.label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--f-heading)', color: m.color, margin: 0 }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([['orders', '📦 Pedidos'], ['customers', '👥 Clientes']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            ...chip(tab === k, 'var(--c-lime)', 'rgba(196,252,21,0.1)'),
            fontSize: 13, padding: '8px 20px',
          }}>{label}</button>
        ))}
      </div>

      {/* ═══════════════ ORDERS TAB ═══════════════ */}
      {tab === 'orders' && (<>
        {/* Filters + export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['all', ...Object.keys(STATUS_LABELS)] as const).map(s => {
              const info = s === 'all'
                ? { label: `Todos (${orders.length})`, color: '#fff', bg: 'rgba(255,255,255,0.06)' }
                : { ...STATUS_LABELS[s as StatusType], label: `${STATUS_LABELS[s as StatusType].label} (${metrics.countByStatus[s]??0})` };
              return <button key={s} onClick={() => setFilterStatus(s as any)} style={chip(filterStatus === s, info.color, info.bg)}>{info.label}</button>;
            })}
          </div>
          <button onClick={exportOrders} style={{ background: 'var(--c-lime)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📥 Exportar CSV</button>
        </div>

        <input type="text" className="input-dark" placeholder="🔍 Buscar por nombre, email o ID..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 420, marginBottom: 16 }} />

        {filtered.length === 0 ? (
          <div style={{ ...box, textAlign: 'center', padding: 48, color: 'var(--c-text-muted)' }}>📭 Sin pedidos con estos filtros.</div>
        ) : (
          <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['#','Fecha','Cliente','Email','Tel','Total','Estado','Cambiar'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o, idx) => {
                    const si = STATUS_LABELS[(o.status as StatusType) ?? 'pending'] ?? STATUS_LABELS.pending;
                    const exp = expandedOrder === o.id;
                    return (
                      <React.Fragment key={o.id}>
                        <tr onClick={() => setExpandedOrder(exp ? null : o.id)} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: exp ? 'rgba(196,252,21,0.03)' : idx%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)', cursor: 'pointer' }}>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#666' }}>{o.id.slice(0,8).toUpperCase()}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{fmtDate(o.created_at)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{o.customer_name || '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--c-text-muted)' }}>{o.customer_email || '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--c-text-muted)' }}>{o.customer_phone || '—'}</td>
                          <td style={{ padding: '10px 14px', fontFamily: 'var(--f-heading)', color: 'var(--c-lime)', fontWeight: 700 }}>${fmtMXN(o.total)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ background: si.bg, color: si.color, border: `1px solid ${si.color}33`, borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{si.label}</span>
                          </td>
                          <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                            <select value={o.status ?? 'pending'} disabled={updatingId === o.id} onChange={e => handleStatusChange(o.id, e.target.value as StatusType)}
                              style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
                              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                        </tr>
                        {exp && (
                          <tr><td colSpan={8} style={{ padding: 0 }}>
                            <div style={{ background: 'rgba(196,252,21,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '16px 20px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                                <div>
                                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-lime)', marginBottom: 8 }}>📍 Cliente</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Nombre:</strong> {o.customer_name||'—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Email:</strong> {o.customer_email||'—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Tel:</strong> {o.customer_phone||'—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Dirección:</strong> {o.customer_address||'—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Colonia:</strong> {o.customer_neighborhood||'—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Ciudad:</strong> {o.customer_city||'—'}, {o.customer_state||''} CP {o.customer_zip||''}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Ref:</strong> {o.customer_reference||'—'}</p>
                                  <p style={{ fontSize: 12, color: o.accepts_marketing ? '#9C27B0' : '#666', margin: '4px 0 0', fontWeight: 600 }}>
                                    {o.accepts_marketing ? '✅ Acepta marketing' : '❌ No acepta marketing'}
                                  </p>
                                </div>
                                <div>
                                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-lime)', marginBottom: 8 }}>📦 Productos</p>
                                  {Array.isArray(o.items) && o.items.length > 0 ? o.items.map((item: CartItem, i: number) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{item.quantity}× {item.product?.name || 'Producto'}</span>
                                      <span style={{ fontSize: 12, color: 'var(--c-lime)', fontWeight: 600 }}>${fmtMXN((item.product?.price||0)*item.quantity)}</span>
                                    </div>
                                  )) : <p style={{ fontSize: 12, color: '#666' }}>Sin detalle</p>}
                                </div>
                                <div>
                                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-lime)', marginBottom: 8 }}>💰 Resumen</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.id}</span></p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}><strong>Fecha:</strong> {fmtDate(o.created_at)}</p>
                                  <p style={{ fontSize: 22, fontFamily: 'var(--f-heading)', color: 'var(--c-lime)', margin: '8px 0 0' }}>${fmtMXN(o.total)} MXN</p>
                                </div>
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: 'var(--c-text-muted)' }}>
              Mostrando {filtered.length} de {orders.length} pedidos
            </div>
          </div>
        )}
      </>)}

      {/* ═══════════════ CUSTOMERS TAB ═══════════════ */}
      {tab === 'customers' && (<>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <p style={{ color: 'var(--c-text-muted)', fontSize: 13, margin: 0 }}>
            {customers.length} clientes únicos · {metrics.marketingEmails} aceptan marketing
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportCustomers} style={{ background: 'var(--c-lime)', color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📥 Exportar Clientes</button>
            <button onClick={exportMarketingEmails} style={{ background: '#9C27B0', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📧 Exportar Newsletter</button>
          </div>
        </div>

        <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Email','Nombre','Teléfono','Ciudad','Estado','Pedidos','Total Gastado','Último Pedido','Newsletter'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.email} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i%2===0?'transparent':'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 14px', color: '#2196F3', fontWeight: 600 }}>{c.email}</td>
                    <td style={{ padding: '10px 14px' }}>{c.name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--c-text-muted)' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--c-text-muted)' }}>{c.city || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--c-text-muted)' }}>{c.state || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>{c.totalOrders}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--f-heading)', color: 'var(--c-lime)', fontWeight: 700 }}>${fmtMXN(c.totalSpent)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--c-text-muted)', fontSize: 12 }}>{fmtDate(c.lastOrder)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {c.acceptsMarketing
                        ? <span style={{ color: '#4CAF50', fontWeight: 700, fontSize: 12 }}>✅ Sí</span>
                        : <span style={{ color: '#666', fontSize: 12 }}>No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </div>
  );
};
