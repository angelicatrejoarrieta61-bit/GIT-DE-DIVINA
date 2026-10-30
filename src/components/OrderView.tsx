/**
 * OrderView.tsx — Resumen del pedido para el cliente: estado, entrega, productos, totales y dirección.
 * Lo usan /pago-exitoso y /mi-pedido. Estilos en OrderPages.css (prefijo op-).
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, MapPin, Package, Truck, Home, Store } from 'lucide-react';
import { getImageUrl } from '../lib/supabase';
import { ORDER_STATUS, orderDate, orderMoney, orderStep, type PublicOrder } from '../lib/orderPublic';
import '../pages/OrderPages.css';

const STEPS = ['Pagado', 'Preparando', 'En camino', 'Entregado'];

export const OrderView: React.FC<{ order: PublicOrder; compact?: boolean }> = ({ order, compact = false }) => {
  const [copied, setCopied] = useState(false);
  const st = ORDER_STATUS[order.status] ?? { label: order.status, tone: 'info' as const };
  const step = orderStep(order.status);
  const a = order.address;
  const addr = [a.street, a.neighborhood, [a.city, a.state].filter(Boolean).join(', '), a.zip ? `CP ${a.zip}` : ''].filter(Boolean);

  const copy = async () => {
    try { await navigator.clipboard.writeText(order.number); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* sin portapapeles */ }
  };

  return (
    <article className="op-order" aria-label={`Pedido ${order.number}`}>
      <header className="op-order__head">
        <div>
          <span className="op-k">Pedido</span>
          <button type="button" className="op-number" onClick={() => void copy()} title="Copiar número de pedido">
            #{order.number} {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            <span className="op-vh">{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          {order.created_at && <span className="op-muted">{orderDate(order.created_at)}</span>}
        </div>
        <span className={`op-tag t-${st.tone}`}>{st.label}</span>
      </header>

      {step >= 0 ? (
        <ol className="op-steps" aria-label="Avance del pedido">
          {STEPS.map((s, i) => (
            <li key={s} className={i <= step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="op-steps__dot">{i <= step ? <Check size={11} aria-hidden="true" /> : null}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      ) : order.status === 'cancelled' ? (
        <p className="op-note op-note--bad">Este pedido se canceló y no se hizo ningún cargo. Si tienes dudas escríbenos.</p>
      ) : (
        <p className="op-note op-note--warn">El pago de este pedido no se completó y no se hizo ningún cargo. Puedes volver a comprar con otra tarjeta.</p>
      )}

      {(order.status === 'shipped' || order.status === 'delivered') && order.delivery.kind && (
        <section className="op-ship">
          <span className="op-ship__icon" aria-hidden="true">
            {order.delivery.kind === 'personal' ? <Home size={16} /> : order.delivery.kind === 'proveedor' ? <Store size={16} /> : <Truck size={16} />}
          </span>
          <div>
            <strong>{order.delivery.kind === 'personal' ? 'Entrega personal' : order.delivery.label}</strong>
            <span>
              {order.delivery.kind === 'personal' && 'Te contactamos para coordinar la entrega.'}
              {order.delivery.kind === 'proveedor' && 'Sale directo del almacén de la marca o distribuidor; puede llegar con su empaque.'}
              {order.tracking_number && <> Guía: <b>{order.tracking_number}</b></>}
            </span>
          </div>
          {order.tracking_url && (
            <a className="op-btn op-btn--sm" href={order.tracking_url} target="_blank" rel="noopener noreferrer">Rastrear <ExternalLink size={12} aria-hidden="true" /></a>
          )}
        </section>
      )}
      {order.status === 'paid' && (
        <p className="op-note">Te escribimos a <b>{order.email_masked ?? 'tu correo'}</b> cuando salga, con la forma de entrega y, si aplica, tu número de guía.</p>
      )}

      <div className={`op-grid ${compact ? 'op-grid--one' : ''}`}>
        <section className="op-card">
          <h3 className="op-h"><Package size={14} aria-hidden="true" /> Productos</h3>
          <ul className="op-items">
            {order.items.map((i, k) => (
              <li key={`${i.name}-${k}`}>
                {i.image_url
                  ? <img src={getImageUrl(i.image_url, { width: 112, quality: 70 })} alt="" width={56} height={56} loading="lazy" />
                  : <span className="op-thumb" aria-hidden="true"><Package size={16} /></span>}
                <span className="op-items__txt">
                  {i.slug ? <Link to={`/producto/${i.slug}`}>{i.name}</Link> : <span>{i.name}</span>}
                  <span className="op-muted">{i.variant ? `${i.variant} · ` : ''}{i.qty} × {orderMoney(i.price)}</span>
                </span>
                <span className="op-money">{orderMoney(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="op-totals">
            <div><dt>Subtotal</dt><dd>{orderMoney(order.subtotal)}</dd></div>
            {order.discount > 0 && <div className="is-discount"><dt>Descuento{order.coupon_code ? ` (${order.coupon_code})` : ''}</dt><dd>−{orderMoney(order.discount)}</dd></div>}
            <div><dt>Envío</dt><dd>{order.shipping > 0 ? orderMoney(order.shipping) : 'Gratis'}</dd></div>
            <div className="is-total"><dt>Total</dt><dd>{orderMoney(order.total)}</dd></div>
          </dl>
        </section>

        <section className="op-card">
          <h3 className="op-h"><MapPin size={14} aria-hidden="true" /> Se envía a</h3>
          <p className="op-addr">
            {a.name && <strong>{a.name}</strong>}
            {addr.map((l) => <span key={l}>{l}</span>)}
            {a.reference && <em>Ref: {a.reference}</em>}
          </p>
          {order.email_masked && <p className="op-muted op-small">Confirmación enviada a {order.email_masked}</p>}
        </section>
      </div>
    </article>
  );
};
