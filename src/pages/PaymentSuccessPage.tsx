/**
 * PaymentSuccessPage.tsx — /pago-exitoso?order=<id>
 * Confirma la compra y, al final, muestra el resumen completo del pedido (productos, totales, envío y dirección).
 * Guarda el pedido en este dispositivo para verlo después en /mi-pedido (ícono junto al carrito).
 *
 * Si el banco pidió autorizar la compra (3-D Secure), el pedido llega aquí "pendiente": la página consulta a Clip
 * (/api/charge-clip · action status) cada pocos segundos y cambia sola a "aprobado" o "no satisfactoria".
 * Nunca se dice "aprobado" sin que Clip lo haya aprobado.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Package, X, Loader2 } from 'lucide-react';
import { OrderView } from '../components/OrderView';
import { lookupOrder, rememberOrder, type PublicOrder } from '../lib/orderPublic';
import { useCartStore } from '../store/cartStore';
import './OrderPages.css';

const PAID = ['paid', 'shipped', 'delivered'];
const POLL_MS = 4000;
const POLL_MAX_MS = 20 * 60_000; // Clip cancela una autorización no completada en ~15 min

async function askClip(orderId: string): Promise<string | null> {
  try {
    const r = await fetch('/api/charge-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', orderId }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && typeof j?.status === 'string' ? j.status : null;
  } catch {
    return null;
  }
}

function notifyPaid(orderId: string) {
  // Aviso de pedido nuevo + confirmación al cliente (el servidor evita duplicados y solo envía si está pagado)
  void fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'order-paid', orderId }),
  }).catch(() => {});
}

export const PaymentSuccessPage: React.FC = () => {
  const [params] = useSearchParams();
  const orderId = params.get('order');
  const clearCart = useCartStore((s) => s.clearCart);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(orderId));
  const [status, setStatus] = useState<string | null>(null);
  const startedRef = useRef(Date.now());

  // Carga inicial: si viene del banco y sigue pendiente, primero se consulta a Clip
  useEffect(() => {
    if (!orderId) return;
    rememberOrder(orderId);
    let alive = true;
    (async () => {
      const fresh = await askClip(orderId);
      try {
        const o = await lookupOrder({ orderId });
        if (!alive) return;
        setOrder(o);
        setStatus(fresh && PAID.includes(fresh) ? fresh : o.status);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [orderId]);

  // Pendiente de autorización del banco: consulta a Clip hasta que tenga respuesta final
  useEffect(() => {
    if (!orderId || status !== 'pending') return;
    let alive = true;
    const timer = window.setInterval(async () => {
      if (Date.now() - startedRef.current > POLL_MAX_MS) { window.clearInterval(timer); return; }
      const s = await askClip(orderId);
      if (!alive || !s || s === 'pending') return;
      window.clearInterval(timer);
      setStatus(s);
      try { const o = await lookupOrder({ orderId }); if (alive) setOrder(o); } catch { /* el estado ya cambió */ }
    }, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [orderId, status]);

  // Pagado: avisos y carrito vacío (una vez)
  const doneRef = useRef(false);
  useEffect(() => {
    if (!orderId || !status || !PAID.includes(status) || doneRef.current) return;
    doneRef.current = true;
    notifyPaid(orderId);
    clearCart();
  }, [orderId, status, clearCart]);

  const name = order?.first_name;
  const paid = Boolean(status && PAID.includes(status));
  const pending = status === 'pending';
  const failed = Boolean(order && status && !paid && !pending);

  return (
    <div className="op">
      <section className="op-band">
        <div className="op-band__in" aria-live="polite">
          {pending || loading ? (
            <>
              <span className="op-band__icon" aria-hidden="true"><Loader2 size={24} strokeWidth={2.6} style={{ animation: 'op-spin 1s linear infinite' }} /></span>
              <div>
                <h1>{loading ? 'Confirmando tu pago…' : 'Confirmando tu pago con el banco…'}</h1>
                <p>{loading ? 'Un momento, estamos revisando tu pago con Clip.' : <>Si tu banco te pidió autorizar la compra en su app o por SMS, autorízala. Esta página se actualiza sola; no la cierres.</>}</p>
              </div>
            </>
          ) : failed ? (
            <>
              <span className="op-band__icon op-band__icon--bad" aria-hidden="true"><X size={24} strokeWidth={2.6} /></span>
              <div>
                <h1>Tu compra no fue satisfactoria</h1>
                <p>No se hizo ningún cargo. Intenta con otra tarjeta.</p>
              </div>
            </>
          ) : paid ? (
            <>
              <span className="op-band__icon" aria-hidden="true"><Check size={24} strokeWidth={2.6} /></span>
              <div>
                <h1>¡Gracias por tu compra{name ? `, ${name}` : ''}!</h1>
                <p>Tu pago fue aprobado. Te enviamos la confirmación por correo y te avisamos cuando tu pedido salga.</p>
              </div>
            </>
          ) : (
            <>
              <span className="op-band__icon" aria-hidden="true"><Package size={24} strokeWidth={2.6} /></span>
              <div>
                <h1>Tu pedido quedó registrado</h1>
                <p>Consulta el estado de tu pago en <b>Mi pedido</b> con tu número de pedido y tu correo.</p>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="op-wrap">
        {loading && <div className="op-order" aria-busy="true"><div className="op-skel" /><div className="op-skel" /><div className="op-skel" /></div>}
        {!loading && order && <OrderView order={{ ...order, status: status || order.status }} />}
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
      <style>{'@keyframes op-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.op-band__icon svg{animation:none!important}}'}</style>
    </div>
  );
};
