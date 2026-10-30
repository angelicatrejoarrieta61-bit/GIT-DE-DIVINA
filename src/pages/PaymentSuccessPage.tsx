/**
 * PaymentSuccessPage.tsx — /pago-exitoso?order=<id>
 * Confirma la compra y, al final, muestra el resumen completo del pedido (productos, totales, envío y dirección).
 * Guarda el pedido en este dispositivo para verlo después en /mi-pedido (ícono junto al carrito).
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Package, X } from 'lucide-react';
import { OrderView } from '../components/OrderView';
import { lookupOrder, rememberOrder, type PublicOrder } from '../lib/orderPublic';
import './OrderPages.css';

export const PaymentSuccessPage: React.FC = () => {
  const [params] = useSearchParams();
  const orderId = params.get('order');
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(orderId));

  useEffect(() => {
    if (!orderId) return;
    rememberOrder(orderId);
    // Respaldo del aviso de pedido nuevo y la confirmación al cliente (el servidor evita duplicados)
    void fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'order-paid', orderId }),
    }).catch(() => {});
    let alive = true;
    lookupOrder({ orderId })
      .then((o) => { if (alive) setOrder(o); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderId]);

  const name = order?.first_name;
  // Si alguien abre esta página con un pedido que no se pagó, no se le dice que fue aprobado
  const failed = Boolean(order && !['paid', 'shipped', 'delivered'].includes(order.status));

  return (
    <div className="op">
      <section className="op-band">
        <div className="op-band__in">
          {failed ? (
            <>
              <span className="op-band__icon op-band__icon--bad" aria-hidden="true"><X size={24} strokeWidth={2.6} /></span>
              <div>
                <h1>Tu compra no fue satisfactoria</h1>
                <p>No se hizo ningún cargo. Intenta con otra tarjeta.</p>
              </div>
            </>
          ) : (
            <>
              <span className="op-band__icon" aria-hidden="true"><Check size={24} strokeWidth={2.6} /></span>
              <div>
                <h1>¡Gracias por tu compra{name ? `, ${name}` : ''}!</h1>
                <p>Tu pago fue aprobado. Te enviamos la confirmación por correo y te avisamos cuando tu pedido salga.</p>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="op-wrap">
        {loading && <div className="op-order" aria-busy="true"><div className="op-skel" /><div className="op-skel" /><div className="op-skel" /></div>}
        {!loading && order && <OrderView order={order} />}
        {!loading && !order && (
          <div className="op-order">
            <p className="op-note">{error || 'Tu compra quedó registrada.'} Puedes consultarla en cualquier momento en <b>Mi pedido</b> con tu número de pedido y tu correo.</p>
          </div>
        )}

        <div className="op-actions">
          {failed
            ? <Link to="/checkout" className="op-btn op-btn--primary">Intentar con otra tarjeta</Link>
            : <Link to={orderId ? `/mi-pedido?id=${orderId}` : '/mi-pedido'} className="op-btn op-btn--primary"><Package size={15} aria-hidden="true" /> Seguir mi pedido</Link>}
          <Link to="/catalogo" className="op-btn">Seguir comprando</Link>
          <Link to="/" className="op-btn">Volver al inicio</Link>
        </div>
        <p className="op-muted">Puedes ver el avance de tu pedido cuando quieras desde el ícono de <b>Mi pedido</b>, arriba junto al carrito.</p>
      </div>
    </div>
  );
};
