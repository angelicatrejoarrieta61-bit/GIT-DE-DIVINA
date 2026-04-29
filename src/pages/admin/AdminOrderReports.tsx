import React, { useEffect, useState, useMemo } from 'react';
import { getOrders, updateOrderStatus } from '../../lib/queries';
import type { Order, CartItem } from '../../types';

type StatusType = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

const STATUS_LABELS: Record<StatusType, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pendiente',   color: '#FFC107', bg: 'rgba(255,193,7,0.12)'  },
  paid:      { label: 'Pagado',      color: '#4CAF50', bg: 'rgba(76,175,80,0.12)'  },
  shipped:   { label: 'Enviado',     color: '#2196F3', bg: 'rgba(33,150,243,0.12)' },
  delivered: { label: 'Entregado',   color: '#9C27B0', bg: 'rgba(156,39,176,0.12)' },
  cancelled: { label: 'Cancelado',   color: '#ff6b6b', bg: 'rgba(255,107,107,0.12)'},
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtMXN(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

export const AdminOrderReports: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<StatusType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    const data = await getOrders();
    setOrders(data);
    setLoading(false);
  };

  const handleStatusChange = async (orderId: string, newStatus: StatusType) => {
    setUpdatingId(orderId);
    await updateOrderStatus(orderId, newStatus);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setUpdatingId(null);
  };

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchStatus = filterStatus === 'all' || o.status === filterStatus;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.customer_email || '').toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [orders, filterStatus, search]);

  // Metrics
  const metrics = useMemo(() => {
    const totalRevenue = orders.filter(o => o.status === 'paid' || o.status === 'delivered' || o.status === 'shipped').reduce((s, o) => s + (o.total || 0), 0);
    const totalPending = orders.filter(o => o.status === 'pending').reduce((s, o) => s + (o.total || 0), 0);
    const countByStatus = Object.fromEntries(
      Object.keys(STATUS_LABELS).map(k => [k, orders.filter(o => o.status === k).length])
    );
    const avgOrderValue = orders.length ? orders.reduce((s, o) => s + (o.total || 0), 0) / orders.length : 0;
    return { totalRevenue, totalPending, countByStatus, avgOrderValue };
  }, [orders]);

  const box = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '20px 24px',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--c-text-muted)' }}>
        <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--c-lime)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        Cargando reportes...
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, color: 'var(--c-lime)', marginBottom: 6 }}>📊 Reportes de Pedidos y Pagos</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: 13, margin: 0 }}>
          Todos los pedidos registrados en la tienda, gestionados con Clip México.
        </p>
      </div>

      {/* ── Metrics ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Ventas', value: `$${fmtMXN(metrics.totalRevenue)}`, sub: 'pagados + enviados', color: 'var(--c-lime)' },
          { label: 'Pendiente de Cobro', value: `$${fmtMXN(metrics.totalPending)}`, sub: 'pedidos pendientes', color: '#FFC107' },
          { label: 'Total Pedidos', value: orders.length, sub: 'todos los estados', color: '#fff' },
          { label: 'Ticket Promedio', value: `$${fmtMXN(metrics.avgOrderValue)}`, sub: 'por pedido', color: '#aaa' },
        ].map(m => (
          <div key={m.label} style={box}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-muted)', margin: '0 0 6px' }}>{m.label}</p>
            <p style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--f-heading)', color: m.color, margin: '0 0 2px' }}>{m.value}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Status summary chips ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {(['all', ...Object.keys(STATUS_LABELS)] as const).map(s => {
          const info = s === 'all' ? { label: `Todos (${orders.length})`, color: '#fff', bg: 'rgba(255,255,255,0.06)' } : { ...STATUS_LABELS[s as StatusType], label: `${STATUS_LABELS[s as StatusType].label} (${metrics.countByStatus[s] ?? 0})` };
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s as any)}
              style={{
                background: filterStatus === s ? info.bg : 'rgba(255,255,255,0.03)',
                border: `1px solid ${filterStatus === s ? info.color : 'rgba(255,255,255,0.08)'}`,
                color: filterStatus === s ? info.color : 'var(--c-text-muted)',
                borderRadius: 100,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--f-sub)',
                transition: 'all 0.2s',
              }}
            >
              {info.label}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          className="input-dark"
          placeholder="🔍 Buscar por nombre, email o ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      {/* ── Orders Table ── */}
      {filtered.length === 0 ? (
        <div style={{ ...box, textAlign: 'center', padding: 48, color: 'var(--c-text-muted)' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📭</p>
          <p>No se encontraron pedidos con estos filtros.</p>
        </div>
      ) : (
        <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['#', 'Fecha', 'Cliente', 'Items', 'Total', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, idx) => {
                  const statusInfo = STATUS_LABELS[(order.status as StatusType) ?? 'pending'] ?? STATUS_LABELS.pending;
                  const isExpanded = expandedOrder === order.id;
                  return (
                    <React.Fragment key={order.id}>
                      <tr
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isExpanded ? 'rgba(196,252,21,0.03)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                          transition: 'background 0.2s',
                          cursor: 'pointer',
                        }}
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      >
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: '#666' }}>
                          {order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                          {fmtDate(order.created_at)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{order.customer_name || '—'}</p>
                          <p style={{ margin: 0, fontSize: 11, color: 'var(--c-text-muted)' }}>{order.customer_email || ''}</p>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--c-text-muted)', fontSize: 12 }}>
                          {Array.isArray(order.items) ? order.items.length : '—'} producto{Array.isArray(order.items) && order.items.length !== 1 ? 's' : ''}
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--f-heading)', color: 'var(--c-lime)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ${fmtMXN(order.total)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: statusInfo.bg,
                            color: statusInfo.color,
                            border: `1px solid ${statusInfo.color}33`,
                            borderRadius: 100,
                            padding: '3px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            fontFamily: 'var(--f-sub)',
                            whiteSpace: 'nowrap',
                          }}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                          <select
                            value={order.status ?? 'pending'}
                            disabled={updatingId === order.id}
                            onChange={e => handleStatusChange(order.id, e.target.value as StatusType)}
                            style={{
                              background: '#111',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#fff',
                              borderRadius: 8,
                              padding: '4px 8px',
                              fontSize: 12,
                              cursor: 'pointer',
                              outline: 'none',
                              opacity: updatingId === order.id ? 0.5 : 1,
                            }}
                          >
                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div style={{ background: 'rgba(196,252,21,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '16px 20px 20px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>

                                {/* Customer info */}
                                <div>
                                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-lime)', marginBottom: 8 }}>📍 Datos del Cliente</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}><strong>Nombre:</strong> {order.customer_name || '—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}><strong>Email:</strong> {order.customer_email || '—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}><strong>Teléfono:</strong> {order.customer_phone || '—'}</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0 }}><strong>Dirección:</strong> {order.customer_address || '—'}</p>
                                </div>

                                {/* Products */}
                                <div>
                                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-lime)', marginBottom: 8 }}>📦 Productos</p>
                                  {Array.isArray(order.items) && order.items.length > 0 ? (
                                    order.items.map((item: CartItem, i: number) => (
                                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                                          {item.quantity}× {item.product?.name || 'Producto'}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--c-lime)', fontWeight: 600, marginLeft: 16 }}>
                                          ${fmtMXN((item.product?.price || 0) * item.quantity)}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Sin detalles de productos</p>
                                  )}
                                </div>

                                {/* Order summary */}
                                <div>
                                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-lime)', marginBottom: 8 }}>💰 Resumen</p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>
                                    <strong>ID Completo:</strong> <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{order.id}</span>
                                  </p>
                                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}><strong>Fecha:</strong> {fmtDate(order.created_at)}</p>
                                  <p style={{ fontSize: 20, fontFamily: 'var(--f-heading)', color: 'var(--c-lime)', margin: '8px 0 0' }}>${fmtMXN(order.total)} MXN</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--c-text-muted)', margin: 0 }}>
              Mostrando {filtered.length} de {orders.length} pedidos
            </p>
            <button
              onClick={loadOrders}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}
            >
              🔄 Actualizar
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
